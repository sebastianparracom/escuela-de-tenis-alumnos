import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { bagMovements, bookings, packages, paymentRentals, payments, profiles } from "@/db/schema";
import type { DB } from "@/db/types";
import { assert, DomainError } from "@/lib/errors";
import { rentalValue, type LooseType } from "@/lib/pricing";
import { isValidDate } from "@/lib/time";
import { audit } from "./audit";
import { priceFor, requireAdmin } from "./config";
import type { Ctx } from "./context";
import { clientCanActFor, rolesOf, studentInfo } from "./people";

export type Payment = typeof payments.$inferSelect;

// ---------- Bolsas ----------

export type Balances = { individual: number; grupal: number };

/** Saldo = suma de movimientos; puede quedar negativo = clases por pagar (CA-34). */
export async function balancesOf(db: DB, studentId: string): Promise<Balances> {
  const rows = await db
    .select({ bag: bagMovements.bag, total: sql<number>`coalesce(sum(${bagMovements.delta}), 0)::int` })
    .from(bagMovements)
    .where(eq(bagMovements.studentId, studentId))
    .groupBy(bagMovements.bag);
  return {
    individual: rows.find((r) => r.bag === "individual")?.total ?? 0,
    grupal: rows.find((r) => r.bag === "grupal")?.total ?? 0,
  };
}

// ---------- Pagos de clases (CA-23) ----------

export type ClassPaymentInput = {
  payerId: string;
  studentId: string;
  packageId?: number | null;
  looseType?: LooseType | null;
  quantity?: number | null;
  amount: number;
  method: "efectivo" | "transferencia";
  paidOn: string;
  reference?: string | null;
};

export async function registerClassPayment(ctx: Ctx, input: ClassPaymentInput & { isTest?: boolean }) {
  requireAdmin(ctx);
  const roles = await rolesOf(ctx.db, input.payerId);
  assert(roles.includes("cliente"), "Quien paga debe ser un cliente.");
  assert(await clientCanActFor(ctx.db, input.payerId, input.studentId), "El alumno debe ser el mismo cliente o un niño a su cargo.");
  const student = await studentInfo(ctx.db, input.studentId);
  assert(Number.isInteger(input.amount) && input.amount >= 0, "El valor debe ser un monto en pesos, sin decimales.");
  assert(isValidDate(input.paidOn), "Fecha de pago inválida.");
  assert(input.method === "efectivo" || input.method === "transferencia", "Medio de pago inválido.");

  let bag: "individual" | "grupal";
  let classes: number;
  if (input.packageId) {
    const [pkg] = await ctx.db.select().from(packages).where(eq(packages.id, input.packageId));
    assert(pkg && pkg.isActive, "El paquete no existe o está desactivado.");
    bag = pkg.kind;
    classes = pkg.classCount;
  } else {
    assert(input.looseType, "Escoge un paquete o el tipo de clases sueltas.");
    assert(Number.isInteger(input.quantity) && (input.quantity ?? 0) >= 1, "Indica cuántas clases sueltas.");
    bag = input.looseType === "grupal" ? "grupal" : "individual";
    classes = input.quantity!;
  }
  // CA-23, E-08: las clases grupales son solo para niños (RN-06).
  if (bag === "grupal") assert(student.kind === "nino", "Las clases grupales solo se pueden comprar para niños.");

  const [p] = await ctx.db
    .insert(payments)
    .values({
      kind: "clases",
      payerId: input.payerId,
      studentId: input.studentId,
      packageId: input.packageId ?? null,
      looseType: input.packageId ? null : input.looseType,
      quantity: input.packageId ? null : input.quantity,
      bag,
      classes,
      amount: input.amount,
      method: input.method,
      paidOn: input.paidOn,
      reference: input.reference?.trim() || null,
      createdBy: ctx.actor.id,
      isTest: input.isTest ?? false,
      createdAt: ctx.now,
    })
    .returning();
  await ctx.db.insert(bagMovements).values({
    studentId: input.studentId,
    bag,
    delta: classes,
    source: "pago",
    paymentId: p.id,
    createdBy: ctx.actor.id,
    createdAt: ctx.now,
  });
  await audit(ctx, "registrar", "pago", p.id, input);
  return p;
}

/** CA-26: un pago no se borra; se anula con motivo y se revierte su efecto. */
export async function voidPayment(ctx: Ctx, paymentId: string, reason: string) {
  requireAdmin(ctx);
  const why = reason.trim();
  assert(why, "Indica el motivo de la anulación.");
  const [p] = await ctx.db.select().from(payments).where(eq(payments.id, paymentId));
  if (!p) throw new DomainError("El pago no existe.");
  assert(p.status === "activo", "El pago ya está anulado.");
  await ctx.db
    .update(payments)
    .set({ status: "anulado", voidReason: why, voidedBy: ctx.actor.id, voidedAt: ctx.now })
    .where(eq(payments.id, paymentId));
  if (p.kind === "clases") {
    await ctx.db.insert(bagMovements).values({
      studentId: p.studentId!,
      bag: p.bag!,
      delta: -p.classes!,
      source: "anulacion_pago",
      paymentId: p.id,
      note: why,
      createdBy: ctx.actor.id,
      createdAt: ctx.now,
    });
  }
  await audit(ctx, "anular", "pago", paymentId, null, why);
}

// ---------- Alquileres (CA-27, D-28) ----------

export type RentalAccount = { bookingId: string; value: number; paid: number; outstanding: number };

export async function rentalAccounts(db: DB, bookingIds: string[]): Promise<Map<string, RentalAccount>> {
  const out = new Map<string, RentalAccount>();
  if (bookingIds.length === 0) return out;
  const rows = await db.select().from(bookings).where(inArray(bookings.id, bookingIds));
  const paidRows = await db
    .select({ bookingId: paymentRentals.bookingId, total: sql<number>`coalesce(sum(${paymentRentals.amount}), 0)::int` })
    .from(paymentRentals)
    .innerJoin(payments, eq(payments.id, paymentRentals.paymentId))
    .where(and(inArray(paymentRentals.bookingId, bookingIds), eq(payments.status, "activo")))
    .groupBy(paymentRentals.bookingId);
  const prices = new Map<string, Awaited<ReturnType<typeof priceFor>> | null>();
  for (const b of rows) {
    if (!prices.has(b.localDate)) prices.set(b.localDate, await priceFor(db, b.localDate).catch(() => null));
    const p = prices.get(b.localDate);
    const value = p ? rentalValue(b, p) : 0; // D-29: tarifa vigente en la fecha del turno
    const paid = paidRows.find((r) => r.bookingId === b.id)?.total ?? 0;
    out.set(b.id, { bookingId: b.id, value, paid, outstanding: value - paid });
  }
  return out;
}

export type RentalPaymentInput = {
  payerId: string;
  bookingIds: string[];
  method: "efectivo" | "transferencia";
  paidOn: string;
  reference?: string | null;
};

/**
 * D-28: sin abonos parciales. Un pago cubre completo lo pendiente de uno o varios alquileres
 * del mismo cliente; se puede pagar antes de cerrarlos.
 */
export async function registerRentalPayment(ctx: Ctx, input: RentalPaymentInput & { isTest?: boolean }) {
  requireAdmin(ctx);
  const ids = [...new Set(input.bookingIds)];
  assert(ids.length > 0, "Escoge al menos un alquiler.");
  assert(isValidDate(input.paidOn), "Fecha de pago inválida.");
  const rows = await ctx.db.select().from(bookings).where(inArray(bookings.id, ids));
  assert(rows.length === ids.length, "Hay alquileres que no existen.");
  for (const b of rows) {
    assert(b.kind === "alquiler", "Solo se pagan alquileres.");
    assert(b.clientId === input.payerId, "Todos los alquileres deben ser del cliente que paga.");
    assert(b.status === "agendada" || b.status === "usado", "No se cobran alquileres cancelados o no usados.");
  }
  const accounts = await rentalAccounts(ctx.db, ids);
  for (const a of accounts.values()) assert(a.outstanding > 0, "Uno de los alquileres no tiene saldo pendiente.");
  const total = [...accounts.values()].reduce((s, a) => s + a.outstanding, 0);
  const [p] = await ctx.db
    .insert(payments)
    .values({
      kind: "alquiler",
      payerId: input.payerId,
      amount: total,
      method: input.method,
      paidOn: input.paidOn,
      reference: input.reference?.trim() || null,
      createdBy: ctx.actor.id,
      isTest: input.isTest ?? false,
      createdAt: ctx.now,
    })
    .returning();
  await ctx.db.insert(paymentRentals).values([...accounts.values()].map((a) => ({ paymentId: p.id, bookingId: a.bookingId, amount: a.outstanding })));
  await audit(ctx, "registrar", "pago_alquiler", p.id, { ...input, total });
  return p;
}

// ---------- Consultas ----------

export async function paymentsOfStudent(db: DB, studentId: string) {
  return db
    .select({
      id: payments.id,
      paidOn: payments.paidOn,
      amount: payments.amount,
      method: payments.method,
      status: payments.status,
      bag: payments.bag,
      classes: payments.classes,
      packageName: packages.name,
      looseType: payments.looseType,
    })
    .from(payments)
    .leftJoin(packages, eq(packages.id, payments.packageId))
    .where(eq(payments.studentId, studentId))
    .orderBy(desc(payments.paidOn), desc(payments.createdAt));
}

export async function listPayments(db: DB, limit = 100) {
  return db
    .select({
      id: payments.id,
      kind: payments.kind,
      paidOn: payments.paidOn,
      amount: payments.amount,
      method: payments.method,
      status: payments.status,
      payer: profiles.fullName,
      classes: payments.classes,
      bag: payments.bag,
      packageName: packages.name,
    })
    .from(payments)
    .innerJoin(profiles, eq(profiles.id, payments.payerId))
    .leftJoin(packages, eq(packages.id, payments.packageId))
    .orderBy(desc(payments.paidOn), desc(payments.createdAt))
    .limit(limit);
}

export async function paymentDetail(db: DB, id: string) {
  const [p] = await db.select().from(payments).where(eq(payments.id, id));
  if (!p) throw new DomainError("El pago no existe.");
  const rentals = p.kind === "alquiler" ? await db.select().from(paymentRentals).where(eq(paymentRentals.paymentId, id)) : [];
  return { payment: p, rentals };
}
