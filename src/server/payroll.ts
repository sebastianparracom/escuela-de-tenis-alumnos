import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { bookings, children, courts, groups, payrollItems, profiles, sessionEntries, students } from "@/db/schema";
import type { DB } from "@/db/types";
import { assert } from "@/lib/errors";
import type { Period } from "@/lib/periods";
import { isValidDate } from "@/lib/time";
import { audit } from "./audit";
import { requireAdmin } from "./config";
import type { Ctx } from "./context";

export type SessionDetail = {
  entryId: number;
  workDate: string;
  delta: number;
  source: string;
  kind: "individual" | "grupal" | "alquiler";
  startsAt: Date;
  court: string;
  label: string;
};

async function detailRows(db: DB, where: ReturnType<typeof and>): Promise<(SessionDetail & { personId: string; role: "profesor" | "caddie"; payrollItemId: number | null })[]> {
  const rows = await db
    .select({
      entryId: sessionEntries.id,
      personId: sessionEntries.personId,
      role: sessionEntries.role,
      workDate: sessionEntries.workDate,
      delta: sessionEntries.delta,
      source: sessionEntries.source,
      payrollItemId: sessionEntries.payrollItemId,
      kind: bookings.kind,
      startsAt: bookings.startsAt,
      court: courts.name,
      groupName: groups.name,
      studentProfile: students.profileId,
      childName: children.fullName,
      clientName: profiles.fullName,
    })
    .from(sessionEntries)
    .innerJoin(bookings, eq(bookings.id, sessionEntries.bookingId))
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .leftJoin(groups, eq(groups.id, bookings.groupId))
    .leftJoin(students, eq(students.id, bookings.studentId))
    .leftJoin(children, eq(children.id, students.childId))
    .leftJoin(profiles, eq(profiles.id, bookings.clientId))
    .where(where)
    .orderBy(asc(sessionEntries.workDate), asc(bookings.startsAt));
  // Nombre del alumno cliente (join separado para no confundir con el cliente del alquiler).
  const profileIds = [...new Set(rows.map((r) => r.studentProfile).filter(Boolean) as string[])];
  const names = profileIds.length
    ? new Map((await db.select({ id: profiles.id, n: profiles.fullName }).from(profiles).where(inArray(profiles.id, profileIds))).map((p) => [p.id, p.n]))
    : new Map<string, string>();
  return rows.map((r) => ({
    entryId: r.entryId,
    personId: r.personId,
    role: r.role,
    payrollItemId: r.payrollItemId,
    workDate: r.workDate,
    delta: r.delta,
    source: r.source,
    kind: r.kind,
    startsAt: r.startsAt,
    court: r.court,
    label:
      r.kind === "grupal"
        ? `Grupo ${r.groupName}`
        : r.kind === "individual"
          ? `Clase con ${r.childName ?? names.get(r.studentProfile ?? "") ?? ""}`
          : "Alquiler",
  }));
}

/** CA-41, CA-42: sesiones de una persona en el período, con su detalle. */
export async function personSessions(db: DB, personId: string, period: Period) {
  const rows = await detailRows(
    db,
    and(eq(sessionEntries.personId, personId), gte(sessionEntries.workDate, period.start), lte(sessionEntries.workDate, period.end)),
  );
  return { total: rows.reduce((s, r) => s + r.delta, 0), rows };
}

export type PayrollPart = {
  role: "profesor" | "caddie";
  rate: number | null;
  sessions: number;
  inPeriod: number;
  adjustments: number;
  amount: number | null;
};

/** Liquidación de una persona: un subtotal por rol, con su propio valor por sesión (D-43, D-45). */
export type PayrollLine = {
  personId: string;
  name: string;
  parts: PayrollPart[];
  sessions: number;
  amount: number | null;
  entries: (SessionDetail & { role: "profesor" | "caddie" })[];
};

/**
 * CA-51: liquidación del período. Incluye lo pendiente de ese período y, como "ajuste de período
 * anterior", lo que se agregó o corrigió después de liquidar un período pasado (D-26).
 * El valor por sesión es el vigente al liquidar (D-46).
 */
export async function payrollPreview(db: DB, period: Period): Promise<PayrollLine[]> {
  const rows = await detailRows(db, and(isNull(sessionEntries.payrollItemId), lte(sessionEntries.workDate, period.end)));
  const people = rows.length
    ? await db
        .select({ id: profiles.id, name: profiles.fullName, profesorRate: profiles.profesorRate, caddieRate: profiles.caddieRate })
        .from(profiles)
        .where(inArray(profiles.id, [...new Set(rows.map((r) => r.personId))]))
    : [];
  const lines = new Map<string, PayrollLine>();
  for (const r of rows) {
    const p = people.find((x) => x.id === r.personId)!;
    let line = lines.get(r.personId);
    if (!line) {
      line = { personId: r.personId, name: p.name, parts: [], sessions: 0, amount: null, entries: [] };
      lines.set(r.personId, line);
    }
    let part = line.parts.find((x) => x.role === r.role);
    if (!part) {
      part = { role: r.role, rate: r.role === "profesor" ? p.profesorRate : p.caddieRate, sessions: 0, inPeriod: 0, adjustments: 0, amount: null };
      line.parts.push(part);
    }
    part.sessions += r.delta;
    if (r.workDate >= period.start) part.inPeriod += r.delta;
    else part.adjustments += r.delta;
    line.sessions += r.delta;
    line.entries.push(r);
  }
  for (const l of lines.values()) {
    l.parts.sort((a, b) => a.role.localeCompare(b.role) * -1); // profesor primero
    for (const part of l.parts) part.amount = part.rate == null ? null : part.sessions * part.rate;
    l.amount = l.parts.every((x) => x.amount != null) ? l.parts.reduce((s, x) => s + (x.amount ?? 0), 0) : null;
  }
  return [...lines.values()].filter((l) => l.entries.length > 0).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** El administrador marca como pagada la liquidación de una persona (todos sus roles en un solo pago). */
export async function markPayrollPaid(ctx: Ctx, personId: string, period: Period) {
  requireAdmin(ctx);
  assert(isValidDate(period.start) && isValidDate(period.end), "Período inválido.");
  const line = (await payrollPreview(ctx.db, period)).find((l) => l.personId === personId);
  assert(line, "No hay sesiones pendientes para esta persona en el período.");
  for (const part of line.parts) {
    assert(part.rate != null, `Define el valor por sesión de ${line.name} como ${part.role} antes de liquidar.`);
  }
  const items = [];
  for (const part of line.parts) {
    const [item] = await ctx.db
      .insert(payrollItems)
      .values({
        personId,
        role: part.role,
        periodStart: period.start,
        periodEnd: period.end,
        sessions: part.sessions,
        rate: part.rate!,
        amount: part.sessions * part.rate!,
        paidAt: ctx.now,
        paidBy: ctx.actor.id,
      })
      .returning();
    await ctx.db
      .update(sessionEntries)
      .set({ payrollItemId: item.id })
      .where(inArray(sessionEntries.id, line.entries.filter((e) => e.role === part.role).map((e) => e.entryId)));
    items.push(item);
  }
  const amount = items.reduce((s, i) => s + i.amount, 0);
  await audit(ctx, "pagar_liquidacion", "liquidacion", items.map((i) => i.id).join(","), { personId, period, parts: line.parts, amount });
  return { items, amount };
}

export async function paidPayrolls(db: DB, period: Period) {
  return db
    .select({ id: payrollItems.id, name: profiles.fullName, role: payrollItems.role, sessions: payrollItems.sessions, rate: payrollItems.rate, amount: payrollItems.amount, paidAt: payrollItems.paidAt })
    .from(payrollItems)
    .innerJoin(profiles, eq(profiles.id, payrollItems.personId))
    .where(and(eq(payrollItems.periodStart, period.start), eq(payrollItems.periodEnd, period.end)))
    .orderBy(desc(payrollItems.paidAt));
}
