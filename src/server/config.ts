import { and, asc, desc, eq, gte, inArray, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import {
  bookings,
  cancellationReasons,
  courts,
  groups,
  groupSchedule,
  holidayOverrides,
  packages,
  priceLists,
  scheduleBands,
  schedules,
  settings,
} from "@/db/schema";
import type { DB } from "@/db/types";
import { calendarFor, type CalendarKind } from "@/lib/calendar";
import { assert, DomainError } from "@/lib/errors";
import { longDate, weekdayName } from "@/lib/format";
import type { Prices } from "@/lib/pricing";
import { changedIntervals, overlaps, turnsOf, validateBands, type Band, type Turn } from "@/lib/schedule";
import { hhmm, isValidDate, localDate, localMinute } from "@/lib/time";
import { audit } from "./audit";
import { isAdmin, type Ctx } from "./context";

export const INACTIVE_STATUSES = ["cancelada", "cancelada_cliente"] as const;

export function requireAdmin(ctx: Ctx) {
  if (!isAdmin(ctx.actor)) throw new DomainError("Solo un administrador puede hacer esto.");
}

// ---------- Parámetros ----------

export async function getSettings(db: DB) {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  assert(row, "Falta la configuración de la escuela.");
  return row;
}

export type SettingsInput = {
  schoolName?: string;
  logoPath?: string | null;
  clientMaxDays?: number;
  staffMaxDays?: number;
  clientMaxTurns?: number;
  payrollFrequency?: "semanal" | "quincenal" | "mensual";
};

export async function updateSettings(ctx: Ctx, input: SettingsInput) {
  requireAdmin(ctx);
  if (input.schoolName !== undefined) assert(input.schoolName.trim().length > 0, "El nombre de la escuela es obligatorio.");
  for (const [k, v] of [
    ["clientMaxDays", input.clientMaxDays],
    ["staffMaxDays", input.staffMaxDays],
    ["clientMaxTurns", input.clientMaxTurns],
  ] as const) {
    if (v !== undefined) assert(Number.isInteger(v) && v >= 1 && v <= 365, `Valor inválido para ${k}.`);
  }
  await ctx.db
    .update(settings)
    .set({ ...input, schoolName: input.schoolName?.trim() })
    .where(eq(settings.id, 1));
  await audit(ctx, "actualizar", "configuracion", 1, input);
}

// ---------- Canchas ----------

export async function listCourts(db: DB, activeOnly = false) {
  const q = db.select().from(courts).orderBy(asc(courts.sortOrder), asc(courts.id));
  const rows = await q;
  return activeOnly ? rows.filter((c) => c.isActive) : rows;
}

export async function saveCourt(ctx: Ctx, input: { id?: number; name: string; isActive: boolean }) {
  requireAdmin(ctx);
  const name = input.name.trim();
  assert(name, "El nombre de la cancha es obligatorio.");
  if (input.id) {
    if (!input.isActive) {
      const [future] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(bookings)
        .where(
          and(
            eq(bookings.courtId, input.id),
            gte(bookings.startsAt, ctx.now),
            notInArray(bookings.status, [...INACTIVE_STATUSES]),
          ),
        );
      assert(future.n === 0, `La cancha tiene ${future.n} reservas futuras. Cancélalas o muévelas antes de desactivarla.`);
    }
    await ctx.db.update(courts).set({ name, isActive: input.isActive }).where(eq(courts.id, input.id));
    await audit(ctx, "actualizar", "cancha", input.id, input);
    return input.id;
  }
  const [{ max }] = await ctx.db.select({ max: sql<number>`coalesce(max(${courts.sortOrder}), 0)::int` }).from(courts);
  const [row] = await ctx.db.insert(courts).values({ name, isActive: input.isActive, sortOrder: max + 1 }).returning();
  await audit(ctx, "crear", "cancha", row.id, input);
  return row.id;
}

// ---------- Festivos ----------

export async function loadHolidayOverrides(db: DB): Promise<Map<string, boolean>> {
  const rows = await db.select().from(holidayOverrides);
  return new Map(rows.map((r) => [r.date, r.isHoliday]));
}

// ---------- Franjas ----------

export type ScheduleVersion = { id: number; effectiveFrom: string; bands: Band[] };

export async function loadSchedules(db: DB): Promise<ScheduleVersion[]> {
  const vs = await db.select().from(schedules).orderBy(asc(schedules.effectiveFrom));
  if (vs.length === 0) return [];
  const bs = await db
    .select()
    .from(scheduleBands)
    .where(inArray(scheduleBands.scheduleId, vs.map((v) => v.id)))
    .orderBy(asc(scheduleBands.startMin));
  return vs.map((v) => ({
    id: v.id,
    effectiveFrom: v.effectiveFrom,
    bands: bs
      .filter((b) => b.scheduleId === v.id)
      .map((b) => ({
        calendar: b.calendar,
        startMin: b.startMin,
        endMin: b.endMin,
        turnMinutes: b.turnMinutes,
        isNight: b.isNight,
      })),
  }));
}

export function scheduleAt(versions: ScheduleVersion[], date: string): ScheduleVersion | null {
  let found: ScheduleVersion | null = null;
  for (const v of versions) if (v.effectiveFrom <= date) found = v;
  return found;
}

export type DayTurns = { calendar: CalendarKind; turns: Turn[] };

/** Turnos de un día según las franjas vigentes y el calendario (entre semana / fin de semana y festivos). */
export function dayTurns(versions: ScheduleVersion[], overrides: Map<string, boolean>, date: string): DayTurns {
  const calendar = calendarFor(date, overrides);
  const v = scheduleAt(versions, date);
  return { calendar, turns: v ? turnsOf(v.bands, calendar) : [] };
}

export async function turnsForDate(db: DB, date: string): Promise<DayTurns> {
  const [versions, overrides] = await Promise.all([loadSchedules(db), loadHolidayOverrides(db)]);
  return dayTurns(versions, overrides, date);
}

/**
 * Guarda un nuevo juego de franjas que rige desde `effectiveFrom` (CA-11, CA-12).
 * Reemplaza las versiones que empezaban en esa fecha o después.
 */
export async function saveSchedule(ctx: Ctx, effectiveFrom: string, bands: Band[]) {
  requireAdmin(ctx);
  assert(isValidDate(effectiveFrom), "Fecha inválida.");
  assert(effectiveFrom >= localDate(ctx.now), "El cambio de franjas debe regir desde hoy o una fecha futura.");
  assert(bands.length > 0, "Agrega al menos una franja.");
  const errors = validateBands(bands);
  if (errors.length) throw new DomainError(errors.join(" "));

  const conflicts = await scheduleChangeConflicts(ctx.db, effectiveFrom, bands);
  if (conflicts.length) {
    const shown = conflicts.slice(0, 8).join("; ");
    const more = conflicts.length > 8 ? ` y ${conflicts.length - 8} más` : "";
    throw new DomainError(
      `No se puede aplicar el cambio desde ${longDate(effectiveFrom)}: hay reservas dentro de las franjas que cambian (${shown}${more}).`,
    );
  }

  await ctx.db.delete(schedules).where(gte(schedules.effectiveFrom, effectiveFrom));
  const [v] = await ctx.db
    .insert(schedules)
    .values({ effectiveFrom, createdBy: ctx.actor.id, createdAt: ctx.now })
    .returning();
  await ctx.db.insert(scheduleBands).values(bands.map((b) => ({ ...b, scheduleId: v.id })));
  await audit(ctx, "crear", "franjas", v.id, { effectiveFrom, bands });
  return v.id;
}

export async function scheduleChangeConflicts(db: DB, effectiveFrom: string, newBands: Band[]): Promise<string[]> {
  const [versions, overrides] = await Promise.all([loadSchedules(db), loadHolidayOverrides(db)]);
  if (versions.length === 0) return [];
  const out: string[] = [];

  const rows = await db
    .select({
      kind: bookings.kind,
      localDate: bookings.localDate,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      court: courts.name,
      group: groups.name,
    })
    .from(bookings)
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .leftJoin(groups, eq(groups.id, bookings.groupId))
    .where(and(gte(bookings.localDate, effectiveFrom), notInArray(bookings.status, [...INACTIVE_STATUSES])))
    .orderBy(asc(bookings.startsAt));
  for (const r of rows) {
    const current = scheduleAt(versions, r.localDate)?.bands ?? [];
    const cal = calendarFor(r.localDate, overrides);
    const s = localMinute(r.startsAt);
    const e = localMinute(r.endsAt) || 24 * 60;
    if (changedIntervals(current, newBands, cal).some(([a, b]) => overlaps(s, e, a, b))) {
      const what = r.kind === "grupal" ? `clase del grupo ${r.group}` : r.kind === "individual" ? "clase individual" : "alquiler";
      out.push(`${longDate(r.localDate)} ${hhmm(s)} · ${r.court} · ${what}`);
    }
  }

  // Grupos con horario vigente después de la fecha, aunque sus clases aún no estén generadas.
  const applicable = versions.filter((v) => v.effectiveFrom > effectiveFrom);
  const atStart = scheduleAt(versions, effectiveFrom);
  if (atStart) applicable.unshift(atStart);
  const gRows = await db
    .select({
      name: groups.name,
      weekday: groupSchedule.weekday,
      startMin: groupSchedule.startMin,
      court: courts.name,
    })
    .from(groupSchedule)
    .innerJoin(groups, eq(groups.id, groupSchedule.groupId))
    .innerJoin(courts, eq(courts.id, groupSchedule.courtId))
    .where(
      and(
        eq(groups.isActive, true),
        or(isNull(groups.endDate), gte(groups.endDate, effectiveFrom)),
        or(isNull(groupSchedule.validTo), sql`${groupSchedule.validTo} > ${effectiveFrom}`),
      ),
    );
  for (const g of gRows) {
    const cal: CalendarKind = g.weekday >= 6 ? "fin_de_semana" : "entre_semana";
    for (const v of applicable) {
      const turn = turnsOf(v.bands, cal).find((t) => t.startMin === g.startMin);
      const end = turn ? turn.endMin : g.startMin + 1;
      if (changedIntervals(v.bands, newBands, cal).some(([a, b]) => overlaps(g.startMin, end, a, b))) {
        out.push(`grupo ${g.name} (${weekdayName(g.weekday)} ${hhmm(g.startMin)}, ${g.court})`);
        break;
      }
    }
  }
  return [...new Set(out)];
}

// ---------- Motivos ----------

export async function listReasons(db: DB, activeOnly = true) {
  const rows = await db.select().from(cancellationReasons).orderBy(asc(cancellationReasons.sortOrder), asc(cancellationReasons.id));
  return activeOnly ? rows.filter((r) => r.isActive) : rows;
}

export async function saveReason(ctx: Ctx, input: { id?: number; label: string; isActive: boolean }) {
  requireAdmin(ctx);
  const label = input.label.trim();
  assert(label, "Escribe el motivo.");
  if (input.id) {
    await ctx.db.update(cancellationReasons).set({ label, isActive: input.isActive }).where(eq(cancellationReasons.id, input.id));
    await audit(ctx, "actualizar", "motivo", input.id, input);
    return input.id;
  }
  const [{ max }] = await ctx.db
    .select({ max: sql<number>`coalesce(max(${cancellationReasons.sortOrder}), 0)::int` })
    .from(cancellationReasons);
  const [row] = await ctx.db.insert(cancellationReasons).values({ label, isActive: input.isActive, sortOrder: max + 1 }).returning();
  await audit(ctx, "crear", "motivo", row.id, input);
  return row.id;
}

export async function requireReason(db: DB, reasonId: number | null | undefined) {
  assert(reasonId, "Escoge un motivo de la lista.");
  const [r] = await db.select().from(cancellationReasons).where(eq(cancellationReasons.id, reasonId));
  assert(r && r.isActive, "El motivo escogido no es válido.");
  return r;
}

// ---------- Tarifas ----------

export async function priceFor(db: DB, date: string): Promise<Prices> {
  const [row] = await db
    .select()
    .from(priceLists)
    .where(lte(priceLists.effectiveFrom, date))
    .orderBy(desc(priceLists.effectiveFrom))
    .limit(1);
  if (!row) throw new DomainError("Todavía no hay tarifas configuradas para esa fecha.");
  return row;
}

export async function priceForOrNull(db: DB, date: string): Promise<Prices | null> {
  try {
    return await priceFor(db, date);
  } catch {
    return null;
  }
}

export async function listPriceLists(db: DB) {
  return db.select().from(priceLists).orderBy(desc(priceLists.effectiveFrom));
}

export async function savePrices(ctx: Ctx, effectiveFrom: string, p: Prices) {
  requireAdmin(ctx);
  assert(isValidDate(effectiveFrom), "Fecha inválida.");
  for (const v of Object.values(p)) assert(Number.isInteger(v) && v >= 0, "Los precios deben ser valores en pesos, sin decimales.");
  const existing = await ctx.db.select().from(priceLists).where(eq(priceLists.effectiveFrom, effectiveFrom));
  if (existing.length) {
    await ctx.db.update(priceLists).set({ ...p, createdBy: ctx.actor.id }).where(eq(priceLists.effectiveFrom, effectiveFrom));
  } else {
    await ctx.db.insert(priceLists).values({ ...p, effectiveFrom, createdBy: ctx.actor.id, createdAt: ctx.now });
  }
  await audit(ctx, "guardar", "tarifas", effectiveFrom, p);
}

// ---------- Paquetes ----------

export async function listPackages(db: DB, activeOnly = false) {
  const rows = await db.select().from(packages).orderBy(asc(packages.kind), asc(packages.classCount));
  return activeOnly ? rows.filter((p) => p.isActive) : rows;
}

export type PackageInput = { id?: number; name: string; kind: "individual" | "grupal"; classCount: number; price: number; isActive: boolean };

export async function savePackage(ctx: Ctx, input: PackageInput) {
  requireAdmin(ctx);
  const name = input.name.trim();
  assert(name, "El nombre del paquete es obligatorio.");
  assert(Number.isInteger(input.classCount), "El número de clases debe ser un entero.");
  assert(input.classCount >= 4, "El mínimo es de 4 clases por paquete."); // CA-21, E-09
  assert(Number.isInteger(input.price) && input.price >= 0, "El precio debe ser un valor en pesos.");
  if (input.id) {
    // Cambiar un paquete no afecta a quien ya lo compró: el pago guarda sus clases y su valor.
    await ctx.db
      .update(packages)
      .set({ name, kind: input.kind, classCount: input.classCount, price: input.price, isActive: input.isActive })
      .where(eq(packages.id, input.id));
    await audit(ctx, "actualizar", "paquete", input.id, input);
    return input.id;
  }
  const [row] = await ctx.db
    .insert(packages)
    .values({ name, kind: input.kind, classCount: input.classCount, price: input.price, isActive: input.isActive, createdAt: ctx.now })
    .returning();
  await audit(ctx, "crear", "paquete", row.id, input);
  return row.id;
}
