import { and, eq, gte, lte, notInArray, sql } from "drizzle-orm";
import { bagMovements, bookings, cancellationReasons, children, payments, profiles, students } from "@/db/schema";
import type { DB } from "@/db/types";
import { addDays } from "@/lib/time";
import { dayTurns, listCourts, loadHolidayOverrides, loadSchedules } from "./config";
import { rentalAccounts } from "./payments";

/** CA-53: resumen del negocio para un período. */
export async function businessSummary(db: DB, from: string, to: string) {
  const income = await db
    .select({ method: payments.method, total: sql<number>`coalesce(sum(${payments.amount}), 0)::int`, n: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(eq(payments.status, "activo"), gte(payments.paidOn, from), lte(payments.paidOn, to)))
    .groupBy(payments.method);

  const byStatus = await db
    .select({ kind: bookings.kind, status: bookings.status, n: sql<number>`count(*)::int`, turns: sql<number>`coalesce(sum(${bookings.turns}), 0)::int` })
    .from(bookings)
    .where(and(gte(bookings.localDate, from), lte(bookings.localDate, to)))
    .groupBy(bookings.kind, bookings.status);
  const count = (kind: string, status: string) => byStatus.find((r) => r.kind === kind && r.status === status)?.n ?? 0;

  const cancelled = await db
    .select({ reason: cancellationReasons.label, n: sql<number>`count(*)::int` })
    .from(bookings)
    .innerJoin(cancellationReasons, eq(cancellationReasons.id, bookings.cancelReasonId))
    .where(and(eq(bookings.status, "cancelada"), gte(bookings.localDate, from), lte(bookings.localDate, to)))
    .groupBy(cancellationReasons.label);

  // Ocupación (D-32): turnos ocupados sobre turnos disponibles de canchas activas.
  const [versions, overrides, courtList] = await Promise.all([loadSchedules(db), loadHolidayOverrides(db), listCourts(db, true)]);
  let available = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) available += dayTurns(versions, overrides, d).turns.length * courtList.length;
  const occupied = byStatus
    .filter((r) => ["agendada", "dictada", "usado"].includes(r.status))
    .reduce((s, r) => s + r.turns, 0);

  // Saldos por cobrar (D-30): bolsas en negativo y alquileres con saldo.
  const negative = await db
    .select({
      studentId: bagMovements.studentId,
      bag: bagMovements.bag,
      total: sql<number>`sum(${bagMovements.delta})::int`,
      name: sql<string>`coalesce(${profiles.fullName}, ${children.fullName})`,
    })
    .from(bagMovements)
    .innerJoin(students, eq(students.id, bagMovements.studentId))
    .leftJoin(profiles, eq(profiles.id, students.profileId))
    .leftJoin(children, eq(children.id, students.childId))
    .groupBy(bagMovements.studentId, bagMovements.bag, profiles.fullName, children.fullName)
    .having(sql`sum(${bagMovements.delta}) < 0`);

  const rentals = await db
    .select({ id: bookings.id, clientId: bookings.clientId, localDate: bookings.localDate, client: profiles.fullName })
    .from(bookings)
    .innerJoin(profiles, eq(profiles.id, bookings.clientId))
    .where(and(eq(bookings.kind, "alquiler"), notInArray(bookings.status, ["cancelada_cliente"])));
  const accounts = await rentalAccounts(db, rentals.map((r) => r.id));
  const owed = new Map<string, { client: string; amount: number; rentals: number }>();
  const credit: { bookingId: string; client: string; amount: number }[] = [];
  for (const r of rentals) {
    const a = accounts.get(r.id)!;
    if (a.outstanding > 0) {
      const cur = owed.get(r.clientId!) ?? { client: r.client, amount: 0, rentals: 0 };
      cur.amount += a.outstanding;
      cur.rentals += 1;
      owed.set(r.clientId!, cur);
    } else if (a.outstanding < 0) {
      credit.push({ bookingId: r.id, client: r.client, amount: -a.outstanding });
    }
  }

  return {
    income: {
      efectivo: income.find((i) => i.method === "efectivo")?.total ?? 0,
      transferencia: income.find((i) => i.method === "transferencia")?.total ?? 0,
      count: income.reduce((s, i) => s + i.n, 0),
    },
    classes: {
      individualDictadas: count("individual", "dictada"),
      grupalDictadas: count("grupal", "dictada"),
      canceladas: cancelled.sort((a, b) => b.n - a.n),
    },
    rentals: { usados: count("alquiler", "usado"), noUsados: count("alquiler", "no_usado"), cancelados: count("alquiler", "cancelada_cliente") },
    occupancy: { occupied, available, percent: available ? Math.round((occupied / available) * 100) : 0 },
    receivables: {
      bags: negative.sort((a, b) => a.total - b.total),
      rentals: [...owed.values()].sort((a, b) => b.amount - a.amount),
      rentalsTotal: [...owed.values()].reduce((s, o) => s + o.amount, 0),
      credit,
    },
  };
}
