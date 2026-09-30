import { and, asc, eq, gte, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { bookings, children, courts, groupMembers, groups, groupSchedule, holidayOverrides, profiles, userRoles } from "@/db/schema";
import type { DB } from "@/db/types";
import { calendarFor, isHoliday } from "@/lib/calendar";
import { assert, DomainError } from "@/lib/errors";
import { longDate, weekdayName } from "@/lib/format";
import { turnsOf } from "@/lib/schedule";
import { addDays, hhmm, isoWeekday, isValidDate, localDate, toInstant } from "@/lib/time";
import { audit } from "./audit";
import { ensureFree, mapConflict } from "./bookings";
import {
  dayTurns,
  getSettings,
  INACTIVE_STATUSES,
  loadHolidayOverrides,
  loadSchedules,
  requireAdmin,
  scheduleAt,
  type ScheduleVersion,
} from "./config";
import type { Ctx } from "./context";

export type GroupDay = { weekday: number; startMin: number; courtId: number };

export type GroupInput = {
  name: string;
  code: string;
  profesorId: string;
  capacity?: number | null;
  startDate: string;
  endDate?: string | null;
};

type GroupRow = typeof groups.$inferSelect;

/** Las clases de grupo se generan con este margen sobre el horizonte de reservas del personal. */
export async function occurrenceHorizon(db: DB, now: Date) {
  const s = await getSettings(db);
  return addDays(localDate(now), s.staffMaxDays + 7);
}

async function getGroup(db: DB, id: number): Promise<GroupRow> {
  const [g] = await db.select().from(groups).where(eq(groups.id, id));
  if (!g) throw new DomainError("El grupo no existe.");
  return g;
}

async function requireProfesor(db: DB, id: string) {
  const [row] = await db
    .select({ active: profiles.isActive })
    .from(profiles)
    .innerJoin(userRoles, and(eq(userRoles.userId, profiles.id), eq(userRoles.role, "profesor")))
    .where(eq(profiles.id, id));
  assert(row?.active, "El profesor no es válido o está inactivo.");
}

function cleanGroup(input: GroupInput) {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  assert(name, "El nombre del grupo es obligatorio.");
  assert(code && code.length <= 5, "El código del grupo tiene de 1 a 5 caracteres (se ve en el tablero).");
  assert(isValidDate(input.startDate), "Fecha de inicio inválida.");
  if (input.endDate) assert(isValidDate(input.endDate) && input.endDate >= input.startDate, "La fecha de fin debe ser posterior al inicio.");
  if (input.capacity != null) assert(Number.isInteger(input.capacity) && input.capacity > 0, "El cupo debe ser un número positivo.");
  return { name, code };
}

/** Valida que cada día del grupo caiga en un turno de las franjas que rigen desde `from`. */
function validateDays(days: GroupDay[], versions: ScheduleVersion[], from: string) {
  assert(days.length > 0, "Agrega al menos un día de clase.");
  const seen = new Set<number>();
  for (const d of days) {
    assert(d.weekday >= 1 && d.weekday <= 7, "Día inválido.");
    assert(!seen.has(d.weekday), `El ${weekdayName(d.weekday)} está repetido.`);
    seen.add(d.weekday);
  }
  const applicable = versions.filter((v) => v.effectiveFrom > from);
  const at = scheduleAt(versions, from);
  if (at) applicable.unshift(at);
  assert(applicable.length > 0, "Primero configura las franjas.");
  for (const d of days) {
    const cal = d.weekday >= 6 ? "fin_de_semana" : "entre_semana";
    for (const v of applicable) {
      assert(
        turnsOf(v.bands, cal).some((t) => t.startMin === d.startMin),
        `El ${weekdayName(d.weekday)} a las ${hhmm(d.startMin)} no es un turno de las franjas vigentes.`,
      );
    }
  }
}

type Occurrence = { date: string; courtId: number; startsAt: Date; endsAt: Date; night: boolean };

/** Clases que el grupo debe tener entre `from` y `to` según su horario (sin festivos, D-20). */
async function planOccurrences(db: DB, g: GroupRow, from: string, to: string): Promise<Occurrence[]> {
  const [versions, overrides, rows] = await Promise.all([
    loadSchedules(db),
    loadHolidayOverrides(db),
    db.select().from(groupSchedule).where(eq(groupSchedule.groupId, g.id)),
  ]);
  const start = from > g.startDate ? from : g.startDate;
  const end = g.endDate && g.endDate < to ? g.endDate : to;
  const out: Occurrence[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isHoliday(d, overrides)) continue;
    const wd = isoWeekday(d);
    const row = rows.find((r) => r.weekday === wd && r.validFrom <= d && (!r.validTo || r.validTo > d));
    if (!row) continue;
    const turn = dayTurns(versions, overrides, d).turns.find((t) => t.startMin === row.startMin);
    if (!turn) continue;
    out.push({ date: d, courtId: row.courtId, startsAt: toInstant(d, turn.startMin), endsAt: toInstant(d, turn.endMin), night: turn.isNight });
  }
  return out;
}

/**
 * Reserva en la agenda las clases del grupo (CA-17). En modo estricto, un cruce detiene todo
 * y se informa; en la generación diaria automática, los cruces se omiten.
 */
async function insertOccurrences(ctx: Ctx, g: GroupRow, plan: Occurrence[], strict: boolean) {
  const existing = await ctx.db
    .select({ startsAt: bookings.startsAt })
    .from(bookings)
    .where(and(eq(bookings.groupId, g.id), eq(bookings.kind, "grupal")));
  const have = new Set(existing.map((e) => e.startsAt.getTime()));
  const conflicts: string[] = [];
  let created = 0;
  for (const o of plan) {
    if (have.has(o.startsAt.getTime())) continue;
    try {
      await ensureFree(ctx.db, { courtId: o.courtId, startsAt: o.startsAt, endsAt: o.endsAt, profesorId: g.profesorId });
      await ctx.db
        .insert(bookings)
        .values({
          kind: "grupal",
          courtId: o.courtId,
          localDate: o.date,
          startsAt: o.startsAt,
          endsAt: o.endsAt,
          turns: 1,
          nightTurns: o.night ? 1 : 0,
          groupId: g.id,
          profesorId: g.profesorId,
          createdBy: ctx.actor.id,
          isTest: g.isTest,
          createdAt: ctx.now,
        })
        .catch(mapConflict);
      created++;
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
      conflicts.push(`${longDate(o.date)}: ${e.message}`);
      if (strict && conflicts.length >= 5) break;
    }
  }
  if (strict && conflicts.length) {
    throw new DomainError(`El horario del grupo se cruza con otras reservas. ${conflicts.join(" ")}`);
  }
  return { created, conflicts };
}

/** Genera las clases de todos los grupos activos hasta el horizonte (tarea diaria). */
export async function syncAllGroups(ctx: Ctx) {
  const to = await occurrenceHorizon(ctx.db, ctx.now);
  const from = localDate(ctx.now);
  const list = await ctx.db.select().from(groups).where(eq(groups.isActive, true));
  let created = 0;
  const conflicts: string[] = [];
  for (const g of list) {
    const r = await insertOccurrences(ctx, g, await planOccurrences(ctx.db, g, from, to), false);
    created += r.created;
    conflicts.push(...r.conflicts.map((c) => `${g.name}: ${c}`));
  }
  return { created, conflicts };
}

async function deleteFutureOccurrences(db: DB, groupId: number, fromDate: string) {
  // Solo clases sin cerrar: lo cerrado se conserva siempre (RN-14).
  await db
    .delete(bookings)
    .where(and(eq(bookings.groupId, groupId), eq(bookings.kind, "grupal"), eq(bookings.status, "agendada"), gte(bookings.localDate, fromDate)));
}

export async function createGroup(ctx: Ctx, input: GroupInput & { days: GroupDay[]; childIds: string[]; isTest?: boolean }) {
  requireAdmin(ctx);
  const { name, code } = cleanGroup(input);
  await requireProfesor(ctx.db, input.profesorId);
  const versions = await loadSchedules(ctx.db);
  validateDays(input.days, versions, input.startDate);
  const kids = [...new Set(input.childIds)];
  if (input.capacity) assert(kids.length <= input.capacity, `El grupo tiene cupo para ${input.capacity} niños.`);
  await requireChildren(ctx.db, kids);

  const [g] = await ctx.db
    .insert(groups)
    .values({
      name,
      code,
      profesorId: input.profesorId,
      capacity: input.capacity ?? null,
      startDate: input.startDate,
      endDate: input.endDate || null,
      isTest: input.isTest ?? false,
      createdAt: ctx.now,
    })
    .returning();
  await ctx.db.insert(groupSchedule).values(input.days.map((d) => ({ ...d, groupId: g.id, validFrom: input.startDate })));
  if (kids.length) await ctx.db.insert(groupMembers).values(kids.map((childId) => ({ groupId: g.id, childId, joinedOn: input.startDate })));
  const today = localDate(ctx.now);
  await insertOccurrences(ctx, g, await planOccurrences(ctx.db, g, today, await occurrenceHorizon(ctx.db, ctx.now)), true);
  await audit(ctx, "crear", "grupo", g.id, input);
  return g.id;
}

/** CA-17: solo se inscriben niños. */
async function requireChildren(db: DB, ids: string[]) {
  for (const id of ids) {
    const [c] = await db.select().from(children).where(eq(children.id, id));
    assert(c && c.isActive, "Solo se pueden inscribir niños activos.");
  }
}

export async function updateGroup(ctx: Ctx, id: number, input: Omit<GroupInput, "startDate"> & { isActive: boolean }) {
  requireAdmin(ctx);
  const g = await getGroup(ctx.db, id);
  const { name, code } = cleanGroup({ ...input, startDate: g.startDate });
  const today = localDate(ctx.now);
  if (input.profesorId !== g.profesorId) {
    await requireProfesor(ctx.db, input.profesorId);
    // Las clases futuras del profesor anterior pasan al nuevo (los suplentes puntuales se respetan).
    const future = await ctx.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.groupId, id), eq(bookings.status, "agendada"), gte(bookings.startsAt, ctx.now), eq(bookings.profesorId, g.profesorId)));
    for (const b of future) {
      await ensureFree(ctx.db, { startsAt: b.startsAt, endsAt: b.endsAt, profesorId: input.profesorId, caddieId: b.caddieId, excludeId: b.id });
      await ctx.db.update(bookings).set({ profesorId: input.profesorId }).where(eq(bookings.id, b.id)).catch(mapConflict);
    }
  }
  if (input.capacity) {
    const n = await activeMemberCount(ctx.db, id, today);
    assert(n <= input.capacity, `El grupo ya tiene ${n} niños inscritos.`);
  }
  await ctx.db
    .update(groups)
    .set({ name, code, profesorId: input.profesorId, capacity: input.capacity ?? null, endDate: input.endDate || null, isActive: input.isActive })
    .where(eq(groups.id, id));
  const updated = await getGroup(ctx.db, id);
  if (!updated.isActive) {
    await deleteFutureOccurrences(ctx.db, id, today);
  } else {
    if (updated.endDate) await deleteFutureOccurrences(ctx.db, id, addDays(updated.endDate, 1));
    await insertOccurrences(ctx, updated, await planOccurrences(ctx.db, updated, today, await occurrenceHorizon(ctx.db, ctx.now)), true);
  }
  await audit(ctx, "actualizar", "grupo", id, input);
}

/** D-17 y D-18: cambia días, hora o cancha del grupo desde una fecha; lo anterior no cambia. */
export async function setGroupSchedule(ctx: Ctx, groupId: number, fromDate: string, days: GroupDay[]) {
  requireAdmin(ctx);
  const g = await getGroup(ctx.db, groupId);
  assert(isValidDate(fromDate), "Fecha inválida.");
  const today = localDate(ctx.now);
  assert(fromDate >= today, "El cambio de horario rige desde hoy o una fecha futura.");
  const from = fromDate < g.startDate ? g.startDate : fromDate;
  validateDays(days, await loadSchedules(ctx.db), from);

  await deleteFutureOccurrences(ctx.db, groupId, from);
  await ctx.db.delete(groupSchedule).where(and(eq(groupSchedule.groupId, groupId), gte(groupSchedule.validFrom, from)));
  await ctx.db
    .update(groupSchedule)
    .set({ validTo: from })
    .where(and(eq(groupSchedule.groupId, groupId), or(isNull(groupSchedule.validTo), sql`${groupSchedule.validTo} > ${from}`)));
  await ctx.db.insert(groupSchedule).values(days.map((d) => ({ ...d, groupId, validFrom: from })));
  await insertOccurrences(ctx, g, await planOccurrences(ctx.db, g, from, await occurrenceHorizon(ctx.db, ctx.now)), true);
  await audit(ctx, "cambiar_horario", "grupo", groupId, { from, days });
}

async function activeMemberCount(db: DB, groupId: number, date: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), or(isNull(groupMembers.leftOn), sql`${groupMembers.leftOn} > ${date}`)));
  return r.n;
}

export async function addMember(ctx: Ctx, groupId: number, childId: string, fromDate: string) {
  requireAdmin(ctx);
  const g = await getGroup(ctx.db, groupId);
  assert(isValidDate(fromDate), "Fecha inválida.");
  await requireChildren(ctx.db, [childId]);
  const [already] = await ctx.db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.childId, childId), isNull(groupMembers.leftOn)));
  assert(!already, "El niño ya está inscrito en el grupo.");
  if (g.capacity) {
    const n = await activeMemberCount(ctx.db, groupId, fromDate);
    assert(n < g.capacity, `El grupo está lleno (cupo ${g.capacity}).`);
  }
  await ctx.db.insert(groupMembers).values({ groupId, childId, joinedOn: fromDate < g.startDate ? g.startDate : fromDate });
  await audit(ctx, "inscribir", "grupo", groupId, { childId, fromDate });
}

export async function removeMember(ctx: Ctx, groupId: number, childId: string, onDate: string) {
  requireAdmin(ctx);
  assert(isValidDate(onDate), "Fecha inválida.");
  await ctx.db
    .update(groupMembers)
    .set({ leftOn: onDate })
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.childId, childId), isNull(groupMembers.leftOn)));
  await audit(ctx, "retirar", "grupo", groupId, { childId, onDate });
}

// ---------- Festivos (D-07, D-20) ----------

/** Marca o desmarca un día como festivo. `value = null` vuelve al calendario oficial. */
export async function setHolidayOverride(ctx: Ctx, date: string, value: boolean | null) {
  requireAdmin(ctx);
  assert(isValidDate(date), "Fecha inválida.");
  const overrides = await loadHolidayOverrides(ctx.db);
  const beforeCal = calendarFor(date, overrides);
  const beforeHoliday = isHoliday(date, overrides);
  const next = new Map(overrides);
  if (value === null) next.delete(date);
  else next.set(date, value);
  const afterCal = calendarFor(date, next);
  const afterHoliday = isHoliday(date, next);

  if (beforeCal !== afterCal) {
    const [r] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(eq(bookings.localDate, date), ne(bookings.kind, "grupal"), notInArray(bookings.status, [...INACTIVE_STATUSES])));
    assert(r.n === 0, `El ${longDate(date)} ya tiene ${r.n} reservas; cambiar el festivo cambiaría sus franjas.`);
  }

  await ctx.db.delete(holidayOverrides).where(eq(holidayOverrides.date, date));
  if (value !== null) await ctx.db.insert(holidayOverrides).values({ date, isHoliday: value, createdBy: ctx.actor.id, createdAt: ctx.now });

  if (!beforeHoliday && afterHoliday) {
    await ctx.db.delete(bookings).where(and(eq(bookings.localDate, date), eq(bookings.kind, "grupal"), eq(bookings.status, "agendada")));
  } else if (beforeHoliday && !afterHoliday && date >= localDate(ctx.now)) {
    const list = await ctx.db.select().from(groups).where(eq(groups.isActive, true));
    for (const g of list) await insertOccurrences(ctx, g, await planOccurrences(ctx.db, g, date, date), false);
  }
  await audit(ctx, "festivo", "calendario", date, { value });
}

// ---------- Consultas ----------

export async function listGroups(db: DB) {
  return db
    .select({ id: groups.id, name: groups.name, code: groups.code, isActive: groups.isActive, profesor: profiles.fullName, startDate: groups.startDate, endDate: groups.endDate, capacity: groups.capacity })
    .from(groups)
    .innerJoin(profiles, eq(profiles.id, groups.profesorId))
    .orderBy(asc(groups.name));
}

export async function groupDetail(db: DB, id: number, today: string) {
  const g = await getGroup(db, id);
  const schedule = await db
    .select({ weekday: groupSchedule.weekday, startMin: groupSchedule.startMin, courtId: groupSchedule.courtId, court: courts.name, validFrom: groupSchedule.validFrom, validTo: groupSchedule.validTo })
    .from(groupSchedule)
    .innerJoin(courts, eq(courts.id, groupSchedule.courtId))
    .where(and(eq(groupSchedule.groupId, id), or(isNull(groupSchedule.validTo), sql`${groupSchedule.validTo} > ${today}`)))
    .orderBy(asc(groupSchedule.validFrom), asc(groupSchedule.weekday));
  const members = await db
    .select({ childId: children.id, fullName: children.fullName, joinedOn: groupMembers.joinedOn, leftOn: groupMembers.leftOn })
    .from(groupMembers)
    .innerJoin(children, eq(children.id, groupMembers.childId))
    .where(and(eq(groupMembers.groupId, id), or(isNull(groupMembers.leftOn), sql`${groupMembers.leftOn} > ${today}`)))
    .orderBy(asc(children.fullName));
  return { group: g, schedule, members };
}


/** Horas de inicio de turno disponibles (entre semana y fin de semana) en la fecha dada. */
export async function turnStartsAt(db: DB, date: string) {
  const v = scheduleAt(await loadSchedules(db), date);
  return {
    weekday: v ? turnsOf(v.bands, "entre_semana").map((t) => t.startMin) : [],
    weekend: v ? turnsOf(v.bands, "fin_de_semana").map((t) => t.startMin) : [],
  };
}

export async function upcomingOccurrences(db: DB, groupId: number, now: Date, limit = 8) {
  return db
    .select({ id: bookings.id, localDate: bookings.localDate, startsAt: bookings.startsAt, status: bookings.status, court: courts.name, profesor: profiles.fullName })
    .from(bookings)
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .leftJoin(profiles, eq(profiles.id, bookings.profesorId))
    .where(and(eq(bookings.groupId, groupId), gte(bookings.startsAt, now)))
    .orderBy(asc(bookings.startsAt))
    .limit(limit);
}
