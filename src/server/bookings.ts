import { and, eq, gt, inArray, isNull, lt, lte, ne, notInArray, or } from "drizzle-orm";
import {
  bagMovements,
  bookings,
  children,
  courts,
  groupClassParticipants,
  groupMembers,
  groups,
  profiles,
  sessionEntries,
  students,
  userRoles,
} from "@/db/schema";
import type { DB } from "@/db/types";
import { diffEffects, effectsOf, type ClosureState, type Effects } from "@/lib/effects";
import { assert, DomainError } from "@/lib/errors";
import { consecutiveTurns } from "@/lib/schedule";
import { addDays, diffDays, hhmm, isValidDate, localDate, localMinute, toInstant } from "@/lib/time";
import { audit } from "./audit";
import { getSettings, INACTIVE_STATUSES, listCourts, requireAdmin, requireReason, turnsForDate } from "./config";
import { hasRole, isAdmin, type Ctx } from "./context";
import { studentInfo } from "./people";

export type Booking = typeof bookings.$inferSelect;

export const CADDIE_ADD_WINDOW_DAYS = 15; // D-25

const KIND_LABEL = { individual: "una clase individual", grupal: "una clase grupal", alquiler: "un alquiler" } as const;

export async function getBooking(db: DB, id: string): Promise<Booking> {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id));
  if (!b) throw new DomainError("La reserva no existe.");
  return b;
}

// ---------- Cruces (CA-15) ----------

type Slot = { courtId?: number; startsAt: Date; endsAt: Date; profesorId?: string | null; caddieId?: string | null; excludeId?: string };

function overlapping(slot: Slot) {
  return and(
    lt(bookings.startsAt, slot.endsAt),
    gt(bookings.endsAt, slot.startsAt),
    notInArray(bookings.status, [...INACTIVE_STATUSES]),
    slot.excludeId ? ne(bookings.id, slot.excludeId) : undefined,
  );
}

/** Revisa cruces antes de guardar para dar un mensaje claro; la base de datos lo garantiza igual. */
export async function ensureFree(db: DB, slot: Slot) {
  if (slot.courtId !== undefined) {
    const [hit] = await db
      .select({ kind: bookings.kind, court: courts.name })
      .from(bookings)
      .innerJoin(courts, eq(courts.id, bookings.courtId))
      .where(and(eq(bookings.courtId, slot.courtId), overlapping(slot)))
      .limit(1);
    if (hit) throw new DomainError(`La ${hit.court} está ocupada en ese turno por ${KIND_LABEL[hit.kind]}.`);
  }
  if (slot.profesorId && slot.profesorId === slot.caddieId) {
    throw new DomainError("El profesor no puede ser también el caddie de su propia clase.");
  }
  if (slot.profesorId) {
    const [hit] = await db
      .select({ name: profiles.fullName })
      .from(bookings)
      .innerJoin(profiles, eq(profiles.id, bookings.profesorId))
      .where(and(eq(bookings.profesorId, slot.profesorId), overlapping(slot)))
      .limit(1);
    if (hit) throw new DomainError(`El profesor ${hit.name} ya tiene una clase a esa hora.`);
    // RN-08 entre roles: quien es profesor no puede estar de caddie en otra reserva a la misma hora.
    const [asCaddie] = await db
      .select({ name: profiles.fullName })
      .from(bookings)
      .innerJoin(profiles, eq(profiles.id, bookings.caddieId))
      .where(and(eq(bookings.caddieId, slot.profesorId), overlapping(slot)))
      .limit(1);
    if (asCaddie) throw new DomainError(`${asCaddie.name} está como caddie en otra reserva a esa hora.`);
  }
  if (slot.caddieId) {
    const [hit] = await db
      .select({ name: profiles.fullName })
      .from(bookings)
      .innerJoin(profiles, eq(profiles.id, bookings.caddieId))
      .where(and(eq(bookings.caddieId, slot.caddieId), overlapping(slot)))
      .limit(1);
    if (hit) throw new DomainError(`El caddie ${hit.name} está ocupado en otra clase o alquiler a esa hora.`);
    const [asProfesor] = await db
      .select({ name: profiles.fullName })
      .from(bookings)
      .innerJoin(profiles, eq(profiles.id, bookings.profesorId))
      .where(and(eq(bookings.profesorId, slot.caddieId), overlapping(slot)))
      .limit(1);
    if (asProfesor) throw new DomainError(`${asProfesor.name} está dando otra clase a esa hora.`);
  }
}

/** Traduce el rechazo de la base de datos (carrera entre dos usuarios) al mensaje del CA-15. */
export function mapConflict(e: unknown): never {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const err = cur as { code?: string; constraint_name?: string; constraint?: string; message?: string; cause?: unknown };
    if (err.code === "23P01") {
      const name = `${err.constraint_name ?? err.constraint ?? ""} ${err.message ?? ""}`;
      if (name.includes("person_overlap")) throw new DomainError("Esa persona ya está en otra reserva a esa hora (como profesor o como caddie).");
      if (name.includes("court")) throw new DomainError("La cancha está ocupada en ese turno.");
      if (name.includes("profesor")) throw new DomainError("El profesor ya tiene una clase a esa hora.");
      if (name.includes("caddie")) throw new DomainError("El caddie está ocupado en otra clase o alquiler a esa hora.");
      throw new DomainError("Hay un cruce de horario.");
    }
    cur = err.cause;
  }
  throw e;
}

async function withConflicts<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    mapConflict(e);
  }
}

async function requireActiveRole(db: DB, userId: string, role: "profesor" | "caddie" | "cliente", label: string) {
  const [row] = await db
    .select({ active: profiles.isActive })
    .from(profiles)
    .innerJoin(userRoles, and(eq(userRoles.userId, profiles.id), eq(userRoles.role, role)))
    .where(eq(profiles.id, userId));
  assert(row && row.active, `${label} no es válido o está inactivo.`);
}

async function requireActiveCourt(db: DB, courtId: number) {
  const list = await listCourts(db);
  const c = list.find((x) => x.id === courtId);
  assert(c && c.isActive, "La cancha no existe o está inactiva.");
  return c;
}

// ---------- Agendar ----------

export type NewClassInput = { courtId: number; date: string; startMin: number; studentId: string; profesorId?: string };

/** CA-14: el profesor (o un administrador a su nombre, D-14) agenda una clase individual. No pide caddie. */
export async function createIndividualClass(ctx: Ctx, input: NewClassInput) {
  const admin = isAdmin(ctx.actor);
  assert(admin || hasRole(ctx.actor, "profesor"), "Solo profesores y administradores agendan clases.");
  const profesorId = admin ? input.profesorId : ctx.actor.id;
  assert(profesorId, "Escoge el profesor de la clase.");
  if (!admin) assert(!input.profesorId || input.profesorId === ctx.actor.id, "Solo puedes agendar tus propias clases.");
  await requireActiveRole(ctx.db, profesorId, "profesor", "El profesor");
  assert(isValidDate(input.date), "Fecha inválida.");
  const settings = await getSettings(ctx.db);
  const today = localDate(ctx.now);
  // D-15: se pueden registrar clases pasadas sin límite; hacia adelante rige el horizonte (D-08).
  assert(input.date <= addDays(today, settings.staffMaxDays), `Solo se puede agendar hasta ${settings.staffMaxDays} días adelante.`);
  await requireActiveCourt(ctx.db, input.courtId);
  const st = await studentInfo(ctx.db, input.studentId);
  assert(st.isActive, "El alumno está inactivo.");
  const { turns } = await turnsForDate(ctx.db, input.date);
  const turn = turns.find((t) => t.startMin === input.startMin);
  assert(turn, "Ese turno no existe en las franjas de ese día.");
  const startsAt = toInstant(input.date, turn.startMin);
  const endsAt = toInstant(input.date, turn.endMin);
  await ensureFree(ctx.db, { courtId: input.courtId, startsAt, endsAt, profesorId });
  const [b] = await withConflicts(() =>
    ctx.db
      .insert(bookings)
      .values({
        kind: "individual",
        courtId: input.courtId,
        localDate: input.date,
        startsAt,
        endsAt,
        turns: 1,
        nightTurns: turn.isNight ? 1 : 0,
        profesorId,
        studentId: input.studentId,
        createdBy: ctx.actor.id,
        createdAt: ctx.now,
      })
      .returning(),
  );
  await audit(ctx, "agendar", "clase", b.id, input);
  return b;
}

export type NewRentalInput = { courtId: number; date: string; startMin: number; turns: number; clientId?: string };

/** CA-16: un cliente reserva uno o varios turnos seguidos; queda confirmada sin pago y sin bolsa. */
export async function createRental(ctx: Ctx, input: NewRentalInput) {
  const admin = isAdmin(ctx.actor);
  assert(admin || hasRole(ctx.actor, "cliente"), "Solo los clientes con cuenta reservan cancha."); // RN-11
  const clientId = admin ? input.clientId : ctx.actor.id;
  assert(clientId, "Escoge el cliente.");
  if (!admin) assert(!input.clientId || input.clientId === ctx.actor.id, "Solo puedes reservar a tu nombre.");
  await requireActiveRole(ctx.db, clientId, "cliente", "El cliente");
  assert(isValidDate(input.date), "Fecha inválida.");
  assert(Number.isInteger(input.turns) && input.turns >= 1, "Escoge al menos un turno.");
  const settings = await getSettings(ctx.db);
  const today = localDate(ctx.now);
  if (!admin) {
    assert(input.turns <= settings.clientMaxTurns, `Puedes reservar hasta ${settings.clientMaxTurns} turnos seguidos.`);
    assert(input.date <= addDays(today, settings.clientMaxDays), `Solo puedes reservar hasta ${settings.clientMaxDays} días adelante.`);
  } else {
    assert(input.date <= addDays(today, settings.staffMaxDays), `Solo se puede reservar hasta ${settings.staffMaxDays} días adelante.`);
  }
  await requireActiveCourt(ctx.db, input.courtId);
  const { turns } = await turnsForDate(ctx.db, input.date);
  const chosen = consecutiveTurns(turns, input.startMin, input.turns);
  assert(chosen, "Esos turnos no existen o no son seguidos.");
  const startsAt = toInstant(input.date, chosen[0].startMin);
  const endsAt = toInstant(input.date, chosen[chosen.length - 1].endMin);
  if (!admin) assert(startsAt > ctx.now, "Ese turno ya pasó.");
  await ensureFree(ctx.db, { courtId: input.courtId, startsAt, endsAt });
  const [b] = await withConflicts(() =>
    ctx.db
      .insert(bookings)
      .values({
        kind: "alquiler",
        courtId: input.courtId,
        localDate: input.date,
        startsAt,
        endsAt,
        turns: chosen.length,
        nightTurns: chosen.filter((t) => t.isNight).length,
        clientId,
        createdBy: ctx.actor.id,
        createdAt: ctx.now,
      })
      .returning(),
  );
  await audit(ctx, "reservar", "alquiler", b.id, input);
  return b;
}

/** CA-18: quien reservó el alquiler, o un administrador, lo cancela antes de su hora. */
export async function cancelRental(ctx: Ctx, id: string) {
  const b = await getBooking(ctx.db, id);
  assert(b.kind === "alquiler", "Esta reserva no es un alquiler.");
  assert(isAdmin(ctx.actor) || b.clientId === ctx.actor.id, "No puedes cancelar esta reserva.");
  assert(b.status === "agendada", "Esta reserva ya está cerrada.");
  assert(ctx.now < b.startsAt, "Solo se puede cancelar antes de la hora de la reserva.");
  await ctx.db
    .update(bookings)
    .set({ status: "cancelada_cliente", closedAt: ctx.now, closedBy: ctx.actor.id })
    .where(eq(bookings.id, id));
  await audit(ctx, "cancelar", "alquiler", id);
}

// ---------- Efectos contables ----------

async function presentStudentIds(db: DB, bookingId: string): Promise<string[]> {
  const rows = await db
    .select({ studentId: students.id })
    .from(groupClassParticipants)
    .innerJoin(students, eq(students.childId, groupClassParticipants.childId))
    .where(and(eq(groupClassParticipants.bookingId, bookingId), eq(groupClassParticipants.present, true)));
  return rows.map((r) => r.studentId);
}

async function closureState(db: DB, b: Booking): Promise<ClosureState> {
  return {
    kind: b.kind,
    status: b.status,
    studentId: b.studentId,
    profesorId: b.profesorId,
    caddieId: b.caddieId,
    turns: b.turns,
    presentStudentIds: b.kind === "grupal" ? await presentStudentIds(db, b.id) : [],
  };
}

async function postEffects(
  ctx: Ctx,
  b: Booking,
  diff: Effects,
  bagSource: "clase" | "correccion",
  sessionSource: "cierre" | "caddie_agregado" | "correccion",
  note?: string,
) {
  const bagRows = [...diff.bags].map(([key, delta]) => {
    const [studentId, bag] = key.split("|") as [string, "individual" | "grupal"];
    return { studentId, bag, delta, source: bagSource, bookingId: b.id, note: note ?? null, createdBy: ctx.actor.id, createdAt: ctx.now };
  });
  if (bagRows.length) await ctx.db.insert(bagMovements).values(bagRows);
  const sessionRows = [...diff.sessions].map(([key, delta]) => {
    const [personId, role] = key.split("|") as [string, "profesor" | "caddie"];
    return { personId, role, delta, bookingId: b.id, workDate: b.localDate, source: sessionSource, createdBy: ctx.actor.id, createdAt: ctx.now };
  });
  if (sessionRows.length) await ctx.db.insert(sessionEntries).values(sessionRows);
}

// ---------- Participantes de clase de grupo ----------

/** Inscritos vigentes el día de la clase más invitados (D-21). */
export async function groupParticipants(db: DB, b: Booking) {
  assert(b.kind === "grupal" && b.groupId, "No es una clase de grupo.");
  const members = await db
    .select({ childId: children.id, fullName: children.fullName })
    .from(groupMembers)
    .innerJoin(children, eq(children.id, groupMembers.childId))
    .where(
      and(
        eq(groupMembers.groupId, b.groupId),
        lte(groupMembers.joinedOn, b.localDate),
        or(isNull(groupMembers.leftOn), gt(groupMembers.leftOn, b.localDate)),
      ),
    );
  const saved = await db
    .select({ childId: groupClassParticipants.childId, isGuest: groupClassParticipants.isGuest, present: groupClassParticipants.present, fullName: children.fullName })
    .from(groupClassParticipants)
    .innerJoin(children, eq(children.id, groupClassParticipants.childId))
    .where(eq(groupClassParticipants.bookingId, b.id));
  const byId = new Map<string, { childId: string; fullName: string; isGuest: boolean; present: boolean | null }>();
  for (const m of members) byId.set(m.childId, { ...m, isGuest: false, present: null });
  for (const s of saved) byId.set(s.childId, { childId: s.childId, fullName: s.fullName, isGuest: s.isGuest, present: s.present });
  // Una vez cerrada, la lista es la guardada al cerrar.
  const list = b.status === "agendada" ? [...byId.values()] : saved.map((s) => ({ ...s }));
  return list.sort((a, b2) => a.fullName.localeCompare(b2.fullName, "es"));
}

/** RN-08: el profesor de una clase no puede ser también su caddie. */
function assertNotSelfCaddie(b: Pick<Booking, "profesorId">, caddieId: string | null | undefined) {
  if (caddieId && b.profesorId && caddieId === b.profesorId) {
    throw new DomainError("El profesor no puede ser también el caddie de su propia clase.");
  }
}

function canManageClass(ctx: Ctx, b: Booking) {
  return isAdmin(ctx.actor) || (b.profesorId !== null && b.profesorId === ctx.actor.id);
}

export async function addGuest(ctx: Ctx, bookingId: string, childId: string) {
  const b = await getBooking(ctx.db, bookingId);
  assert(b.kind === "grupal", "Solo se agregan invitados a clases de grupo.");
  assert(canManageClass(ctx, b), "No puedes modificar esta clase.");
  assert(b.status === "agendada", "La clase ya está cerrada.");
  const [child] = await ctx.db.select().from(children).where(eq(children.id, childId));
  assert(child && child.isActive, "El niño no existe o está inactivo.");
  const current = await groupParticipants(ctx.db, b);
  assert(!current.some((p) => p.childId === childId), "Ese niño ya está en la lista de la clase.");
  await ctx.db.insert(groupClassParticipants).values({ bookingId, childId, isGuest: true });
  await audit(ctx, "agregar_invitado", "clase", bookingId, { childId });
}

export async function removeGuest(ctx: Ctx, bookingId: string, childId: string) {
  const b = await getBooking(ctx.db, bookingId);
  assert(canManageClass(ctx, b), "No puedes modificar esta clase.");
  assert(b.status === "agendada", "La clase ya está cerrada.");
  await ctx.db
    .delete(groupClassParticipants)
    .where(and(eq(groupClassParticipants.bookingId, bookingId), eq(groupClassParticipants.childId, childId), eq(groupClassParticipants.isGuest, true)));
  await audit(ctx, "quitar_invitado", "clase", bookingId, { childId });
}

// ---------- Cierres ----------

export type CloseClassInput = {
  outcome: "dictada" | "cancelada";
  reasonId?: number | null;
  caddieId?: string | null;
  /** solo clase de grupo: niños presentes */
  presentChildIds?: string[];
};

/**
 * Cierra una clase individual (CA-31, CA-32, CA-33) o de grupo (CA-35).
 * Cancelar una clase por anticipado también es cerrarla como cancelada con motivo (D-16).
 */
export async function closeClass(ctx: Ctx, id: string, input: CloseClassInput) {
  const b = await getBooking(ctx.db, id);
  assert(b.kind !== "alquiler", "Los alquileres los cierra el administrador como usados o no usados.");
  assert(canManageClass(ctx, b), "Solo el profesor de la clase o un administrador pueden cerrarla.");
  assert(b.status === "agendada", "Esta clase ya está cerrada. Un administrador puede corregir el cierre.");

  if (input.outcome === "cancelada") {
    const reason = await requireReason(ctx.db, input.reasonId); // CA-33
    await ctx.db
      .update(bookings)
      .set({ status: "cancelada", cancelReasonId: reason.id, closedAt: ctx.now, closedBy: ctx.actor.id })
      .where(eq(bookings.id, id));
    await audit(ctx, "cerrar_cancelada", "clase", id, { reason: reason.label });
    return;
  }

  assert(ctx.now >= b.startsAt, "Una clase solo se puede cerrar como dictada desde su hora de inicio."); // D-23
  const caddieId = input.caddieId === undefined ? b.caddieId : input.caddieId;
  if (caddieId) {
    assertNotSelfCaddie(b, caddieId);
    await requireActiveRole(ctx.db, caddieId, "caddie", "El caddie");
    await ensureFree(ctx.db, { startsAt: b.startsAt, endsAt: b.endsAt, caddieId, excludeId: b.id });
  }

  const before = await closureState(ctx.db, b);
  if (b.kind === "grupal") {
    const list = await groupParticipants(ctx.db, b);
    const present = new Set(input.presentChildIds ?? []);
    for (const c of present) assert(list.some((p) => p.childId === c), "Hay un niño marcado que no está en la lista de la clase.");
    for (const p of list) {
      await ctx.db
        .insert(groupClassParticipants)
        .values({ bookingId: id, childId: p.childId, isGuest: p.isGuest, present: present.has(p.childId) })
        .onConflictDoUpdate({
          target: [groupClassParticipants.bookingId, groupClassParticipants.childId],
          set: { present: present.has(p.childId) },
        });
    }
  }
  await withConflicts(() =>
    ctx.db
      .update(bookings)
      .set({ status: "dictada", caddieId: caddieId ?? null, closedAt: ctx.now, closedBy: ctx.actor.id })
      .where(eq(bookings.id, id)),
  );
  const after = await closureState(ctx.db, await getBooking(ctx.db, id));
  await postEffects(ctx, b, diffEffects(effectsOf(before), effectsOf(after)), "clase", "cierre");
  await audit(ctx, "cerrar_dictada", "clase", id, { caddieId, present: input.presentChildIds });
}

export type CloseRentalInput = { outcome: "usado" | "no_usado"; caddieId?: string | null; reasonId?: number | null };

/** CA-36: el administrador cierra el alquiler como usado (con o sin caddie) o no usado (con motivo). */
export async function closeRental(ctx: Ctx, id: string, input: CloseRentalInput) {
  requireAdmin(ctx);
  const b = await getBooking(ctx.db, id);
  assert(b.kind === "alquiler", "Esta reserva no es un alquiler.");
  assert(b.status === "agendada", "Este alquiler ya está cerrado. Puedes corregir el cierre.");
  assert(ctx.now >= b.startsAt, "El alquiler se cierra desde su hora de inicio.");
  if (input.outcome === "no_usado") {
    const reason = await requireReason(ctx.db, input.reasonId);
    await ctx.db
      .update(bookings)
      .set({ status: "no_usado", cancelReasonId: reason.id, caddieId: null, closedAt: ctx.now, closedBy: ctx.actor.id })
      .where(eq(bookings.id, id));
    await audit(ctx, "cerrar_no_usado", "alquiler", id, { reason: reason.label });
    return;
  }
  const caddieId = input.caddieId ?? null;
  if (caddieId) {
    await requireActiveRole(ctx.db, caddieId, "caddie", "El caddie");
    await ensureFree(ctx.db, { startsAt: b.startsAt, endsAt: b.endsAt, caddieId, excludeId: b.id });
  }
  const before = await closureState(ctx.db, b);
  await withConflicts(() =>
    ctx.db.update(bookings).set({ status: "usado", caddieId, closedAt: ctx.now, closedBy: ctx.actor.id }).where(eq(bookings.id, id)),
  );
  const after = await closureState(ctx.db, await getBooking(ctx.db, id));
  await postEffects(ctx, b, diffEffects(effectsOf(before), effectsOf(after)), "clase", "cierre");
  await audit(ctx, "cerrar_usado", "alquiler", id, { caddieId });
}

// ---------- Caddie ----------

/**
 * CA-32 y D-25: el caddie se asigna desde que la clase está agendada. Después del cierre, el profesor
 * puede agregarlo a sus clases hasta 15 días después y el administrador siempre. Cambiarlo o quitarlo
 * después del cierre es una corrección.
 */
export async function assignCaddie(ctx: Ctx, id: string, caddieId: string | null) {
  const b = await getBooking(ctx.db, id);
  const admin = isAdmin(ctx.actor);
  if (b.kind === "alquiler") assert(admin, "El caddie de un alquiler lo registra el administrador.");
  else assert(canManageClass(ctx, b), "Solo el profesor de la clase o un administrador pueden asignar el caddie.");
  assert(!["cancelada", "cancelada_cliente", "no_usado"].includes(b.status), "No se asigna caddie a una reserva cancelada o no usada.");

  if (caddieId) {
    assertNotSelfCaddie(b, caddieId);
    await requireActiveRole(ctx.db, caddieId, "caddie", "El caddie");
    await ensureFree(ctx.db, { startsAt: b.startsAt, endsAt: b.endsAt, caddieId, excludeId: b.id });
  }

  if (b.status === "agendada") {
    await withConflicts(() => ctx.db.update(bookings).set({ caddieId }).where(eq(bookings.id, id)));
    await audit(ctx, "asignar_caddie", "reserva", id, { caddieId });
    return;
  }

  // Ya cerrada (dictada / usado)
  assert(caddieId, "Para quitar el caddie de una reserva cerrada, un administrador debe corregir el cierre.");
  assert(!b.caddieId, "Esta reserva ya tiene caddie. Para cambiarlo, un administrador debe corregir el cierre.");
  if (!admin) {
    const days = diffDays(b.localDate, localDate(ctx.now));
    assert(days <= CADDIE_ADD_WINDOW_DAYS, `Solo puedes agregar el caddie hasta ${CADDIE_ADD_WINDOW_DAYS} días después de la clase.`);
  }
  const before = await closureState(ctx.db, b);
  await withConflicts(() => ctx.db.update(bookings).set({ caddieId }).where(eq(bookings.id, id)));
  const after = await closureState(ctx.db, await getBooking(ctx.db, id));
  await postEffects(ctx, b, diffEffects(effectsOf(before), effectsOf(after)), "clase", "caddie_agregado");
  await audit(ctx, "agregar_caddie_cerrada", "reserva", id, { caddieId });
}

// ---------- Suplente ----------

/** D-22: el administrador cambia el profesor de una clase de grupo puntual. */
export async function changeOccurrenceProfesor(ctx: Ctx, id: string, profesorId: string) {
  requireAdmin(ctx);
  const b = await getBooking(ctx.db, id);
  assert(b.kind === "grupal", "Solo aplica a clases de grupo.");
  assert(b.status === "agendada", "La clase ya está cerrada.");
  await requireActiveRole(ctx.db, profesorId, "profesor", "El profesor");
  assertNotSelfCaddie({ profesorId }, b.caddieId);
  await ensureFree(ctx.db, { startsAt: b.startsAt, endsAt: b.endsAt, profesorId, excludeId: b.id });
  await withConflicts(() => ctx.db.update(bookings).set({ profesorId }).where(eq(bookings.id, id)));
  await audit(ctx, "cambiar_profesor", "clase", id, { from: b.profesorId, to: profesorId });
}

// ---------- Correcciones (CA-37) ----------

export type CorrectionInput = {
  status: "dictada" | "cancelada" | "usado" | "no_usado";
  caddieId: string | null;
  reasonId?: number | null;
  presentChildIds?: string[];
};

export async function correctClosure(ctx: Ctx, id: string, input: CorrectionInput, why: string) {
  requireAdmin(ctx);
  const reasonText = why.trim();
  assert(reasonText, "Indica el motivo de la corrección.");
  const b = await getBooking(ctx.db, id);
  const allowed = b.kind === "alquiler" ? ["usado", "no_usado"] : ["dictada", "cancelada"];
  assert(allowed.includes(b.status), "Solo se corrigen reservas ya cerradas.");
  assert(allowed.includes(input.status), "Estado no válido para este tipo de reserva.");
  const positive = input.status === "dictada" || input.status === "usado";
  const caddieId = positive ? input.caddieId : null;

  let cancelReasonId: number | null = null;
  if (!positive) cancelReasonId = (await requireReason(ctx.db, input.reasonId)).id;
  if (positive) assert(ctx.now >= b.startsAt, "No se puede marcar como realizada antes de su hora.");

  // Si vuelve a ocupar el turno, el turno y las personas deben estar libres.
  const wasFree = b.status === "cancelada";
  if (positive) {
    await ensureFree(ctx.db, {
      courtId: wasFree ? b.courtId : undefined,
      profesorId: wasFree ? b.profesorId : null,
      caddieId: caddieId && caddieId !== b.caddieId ? caddieId : null,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      excludeId: b.id,
    });
    if (caddieId) {
      assertNotSelfCaddie(b, caddieId);
      await requireActiveRole(ctx.db, caddieId, "caddie", "El caddie");
    }
  }

  const before = await closureState(ctx.db, b);
  if (b.kind === "grupal") {
    const list = await ctx.db.select().from(groupClassParticipants).where(eq(groupClassParticipants.bookingId, id));
    let rows = list;
    if (rows.length === 0 && positive) {
      // Pasa de cancelada a dictada: se toma la lista de inscritos de ese día.
      const current = await groupParticipants(ctx.db, { ...b, status: "agendada" });
      rows = current.map((p) => ({ bookingId: id, childId: p.childId, isGuest: p.isGuest, present: null }));
      if (rows.length) await ctx.db.insert(groupClassParticipants).values(rows).onConflictDoNothing();
    }
    const present = new Set(positive ? (input.presentChildIds ?? []) : []);
    for (const c of present) assert(rows.some((r) => r.childId === c), "Hay un niño marcado que no está en la lista de la clase.");
    for (const r of rows) {
      await ctx.db
        .update(groupClassParticipants)
        .set({ present: positive ? present.has(r.childId) : null })
        .where(and(eq(groupClassParticipants.bookingId, id), eq(groupClassParticipants.childId, r.childId)));
    }
  }
  await withConflicts(() =>
    ctx.db.update(bookings).set({ status: input.status, caddieId, cancelReasonId }).where(eq(bookings.id, id)),
  );
  const after = await closureState(ctx.db, await getBooking(ctx.db, id));
  await postEffects(ctx, b, diffEffects(effectsOf(before), effectsOf(after)), "correccion", "correccion", reasonText);
  await audit(ctx, "corregir_cierre", b.kind === "alquiler" ? "alquiler" : "clase", id, { before, after }, reasonText);
}

// ---------- Utilidades de consulta ----------

export function bookingTimes(b: Pick<Booking, "startsAt" | "endsAt">) {
  return { start: hhmm(localMinute(b.startsAt)), end: hhmm(localMinute(b.endsAt)) };
}

export async function activeBookingsOn(db: DB, date: string) {
  return db
    .select()
    .from(bookings)
    .where(and(eq(bookings.localDate, date), notInArray(bookings.status, [...INACTIVE_STATUSES])));
}

export async function groupNames(db: DB, ids: number[]) {
  if (ids.length === 0) return new Map<number, { name: string; code: string }>();
  const rows = await db.select({ id: groups.id, name: groups.name, code: groups.code }).from(groups).where(inArray(groups.id, ids));
  return new Map(rows.map((r) => [r.id, { name: r.name, code: r.code }]));
}

