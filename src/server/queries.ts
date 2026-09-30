import { and, asc, desc, eq, gte, inArray, lt, lte, notInArray, or, sql } from "drizzle-orm";
import {
  bookings,
  cancellationReasons,
  childGuardians,
  children,
  courts,
  groupClassParticipants,
  groupMembers,
  groups,
  payments,
  profiles,
  students,
} from "@/db/schema";
import type { DB } from "@/db/types";
import { DomainError } from "@/lib/errors";
import { initials } from "@/lib/format";
import type { Turn } from "@/lib/schedule";
import { localMinute } from "@/lib/time";
import { getBooking, groupParticipants, type Booking } from "./bookings";
import { INACTIVE_STATUSES, listCourts, turnsForDate } from "./config";
import { hasRole, isAdmin, type Actor } from "./context";
import { balancesOf, paymentsOfStudent, rentalAccounts } from "./payments";
import { childrenOf, studentIdOfProfile } from "./people";

// ---------- Tablero / agenda (CA-13, CA-52, D-11) ----------

export type CellState = "libre" | "individual" | "grupal" | "alquiler" | "ocupado";
export type Cell = { state: CellState; label: string; bookingId: string | null; mine: boolean };
export type AgendaDay = {
  date: string;
  calendar: "entre_semana" | "fin_de_semana";
  turns: Turn[];
  courts: { id: number; name: string }[];
  /** cells[turnIndex][courtIndex] */
  cells: Cell[][];
  stats: { classes: number; rentalTurns: number; occupancy: number };
};

export async function agendaDay(db: DB, date: string, viewer: Actor): Promise<AgendaDay> {
  const [{ calendar, turns }, courtList] = await Promise.all([turnsForDate(db, date), listCourts(db, true)]);
  const rows = await db
    .select({
      id: bookings.id,
      kind: bookings.kind,
      courtId: bookings.courtId,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      profesorId: bookings.profesorId,
      clientId: bookings.clientId,
      caddieId: bookings.caddieId,
      profesorName: profiles.fullName,
      groupCode: groups.code,
    })
    .from(bookings)
    .leftJoin(profiles, eq(profiles.id, bookings.profesorId))
    .leftJoin(groups, eq(groups.id, bookings.groupId))
    .where(and(eq(bookings.localDate, date), notInArray(bookings.status, [...INACTIVE_STATUSES])));

  const admin = isAdmin(viewer);
  const staff = admin || hasRole(viewer, "profesor");
  const cells: Cell[][] = turns.map(() => courtList.map(() => ({ state: "libre" as CellState, label: "", bookingId: null, mine: false })));
  let classes = 0;
  let rentalTurns = 0;
  let occupied = 0;
  for (const b of rows) {
    const ci = courtList.findIndex((c) => c.id === b.courtId);
    if (ci < 0) continue;
    const s = localMinute(b.startsAt);
    const e = localMinute(b.endsAt) || 24 * 60;
    const mine = b.profesorId === viewer.id || b.clientId === viewer.id || b.caddieId === viewer.id;
    if (b.kind !== "alquiler") classes++;
    turns.forEach((t, ti) => {
      if (t.startMin < e && s < t.endMin) {
        occupied++;
        if (b.kind === "alquiler") rentalTurns++;
        let cell: Cell;
        if (staff) {
          const label = b.kind === "individual" ? initials(b.profesorName ?? "") : b.kind === "grupal" ? (b.groupCode ?? "G") : "Alq";
          cell = { state: b.kind, label, bookingId: admin || mine ? b.id : null, mine };
        } else {
          cell = { state: mine ? "alquiler" : "ocupado", label: mine ? "Tuya" : "", bookingId: mine ? b.id : null, mine };
        }
        cells[ti][ci] = cell;
      }
    });
  }
  const available = turns.length * courtList.length;
  return {
    date,
    calendar,
    turns,
    courts: courtList.map((c) => ({ id: c.id, name: c.name })),
    cells,
    stats: { classes, rentalTurns, occupancy: available ? Math.round((occupied / available) * 100) : 0 },
  };
}

// ---------- Detalle de una reserva ----------

export type BookingView = Awaited<ReturnType<typeof bookingView>>;

export async function bookingView(db: DB, id: string, viewer: Actor) {
  const b = await getBooking(db, id);
  const admin = isAdmin(viewer);
  const isProfesor = b.profesorId === viewer.id;
  const isCaddie = b.caddieId === viewer.id;
  let isClientSide = b.clientId === viewer.id;
  if (!isClientSide && b.studentId && hasRole(viewer, "cliente")) {
    isClientSide = await canClientSeeStudent(db, viewer.id, b.studentId);
  }
  if (!isClientSide && b.kind === "grupal" && hasRole(viewer, "cliente")) {
    const kids = await childrenOf(db, viewer.id);
    const parts = await groupParticipants(db, b);
    isClientSide = parts.some((p) => kids.some((k) => k.id === p.childId));
  }
  if (!admin && !isProfesor && !isCaddie && !isClientSide) throw new DomainError("No tienes acceso a esta reserva.");

  const [court] = await db.select().from(courts).where(eq(courts.id, b.courtId));
  const names = await namesOf(db, [b.profesorId, b.caddieId, b.clientId, b.closedBy, b.createdBy].filter(Boolean) as string[]);
  let studentName: string | null = null;
  if (b.studentId) {
    const [s] = await db
      .select({ p: profiles.fullName, c: children.fullName })
      .from(students)
      .leftJoin(profiles, eq(profiles.id, students.profileId))
      .leftJoin(children, eq(children.id, students.childId))
      .where(eq(students.id, b.studentId));
    studentName = s?.p ?? s?.c ?? null;
  }
  let group: { id: number; name: string; code: string } | null = null;
  if (b.groupId) {
    const [g] = await db.select({ id: groups.id, name: groups.name, code: groups.code }).from(groups).where(eq(groups.id, b.groupId));
    group = g ?? null;
  }
  let reason: string | null = null;
  if (b.cancelReasonId) {
    const [r] = await db.select().from(cancellationReasons).where(eq(cancellationReasons.id, b.cancelReasonId));
    reason = r?.label ?? null;
  }
  // Una clase de grupo cancelada no guarda lista: para corregirla se usa la de inscritos de ese día.
  const participants = b.kind === "grupal" ? await groupParticipants(db, b.status === "cancelada" ? { ...b, status: "agendada" } : b) : [];
  const account = b.kind === "alquiler" ? (await rentalAccounts(db, [b.id])).get(b.id) ?? null : null;
  return {
    booking: b,
    court: court.name,
    profesor: b.profesorId ? names.get(b.profesorId) ?? null : null,
    caddie: b.caddieId ? names.get(b.caddieId) ?? null : null,
    // D-11: el profesor no ve el nombre del cliente de un alquiler.
    client: b.clientId && (admin || isClientSide) ? names.get(b.clientId) ?? null : null,
    student: studentName,
    group,
    reason,
    participants,
    account,
    closedBy: b.closedBy ? names.get(b.closedBy) ?? null : null,
    can: {
      manage: admin || isProfesor,
      admin,
      cancelRental: b.kind === "alquiler" && (admin || b.clientId === viewer.id),
    },
  };
}

async function namesOf(db: DB, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db.select({ id: profiles.id, name: profiles.fullName }).from(profiles).where(inArray(profiles.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function canClientSeeStudent(db: DB, clientId: string, studentId: string) {
  const [s] = await db.select().from(students).where(eq(students.id, studentId));
  if (!s) return false;
  if (s.profileId) return s.profileId === clientId;
  const [g] = await db.select().from(childGuardians).where(and(eq(childGuardians.childId, s.childId!), eq(childGuardians.clientId, clientId)));
  return Boolean(g);
}

// ---------- Profesor (CA-30) ----------

export type ClassItem = {
  id: string;
  kind: "individual" | "grupal" | "alquiler";
  status: Booking["status"];
  localDate: string;
  startsAt: Date;
  endsAt: Date;
  court: string;
  title: string;
  subtitle: string;
  nightTurns: number;
  caddieId: string | null;
};

async function classItems(db: DB, where: ReturnType<typeof and>, order: "asc" | "desc" = "asc"): Promise<ClassItem[]> {
  const rows = await db
    .select({
      id: bookings.id,
      kind: bookings.kind,
      status: bookings.status,
      localDate: bookings.localDate,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      nightTurns: bookings.nightTurns,
      caddieId: bookings.caddieId,
      turns: bookings.turns,
      court: courts.name,
      groupName: groups.name,
      studentProfile: students.profileId,
      childName: children.fullName,
      groupId: bookings.groupId,
    })
    .from(bookings)
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .leftJoin(groups, eq(groups.id, bookings.groupId))
    .leftJoin(students, eq(students.id, bookings.studentId))
    .leftJoin(children, eq(children.id, students.childId))
    .where(where)
    .orderBy(order === "asc" ? asc(bookings.startsAt) : desc(bookings.startsAt));
  const names = await namesOf(db, rows.map((r) => r.studentProfile).filter(Boolean) as string[]);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    localDate: r.localDate,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    court: r.court,
    nightTurns: r.nightTurns,
    caddieId: r.caddieId,
    title: r.kind === "grupal" ? `Grupo ${r.groupName}` : r.kind === "individual" ? (r.childName ?? names.get(r.studentProfile ?? "") ?? "") : "Alquiler",
    subtitle: r.kind === "alquiler" ? `${r.turns} turno${r.turns > 1 ? "s" : ""}` : r.kind === "grupal" ? "Grupal" : "Individual",
  }));
}

export async function profesorToday(db: DB, profesorId: string, date: string, now: Date) {
  const today = await classItems(
    db,
    and(eq(bookings.profesorId, profesorId), eq(bookings.localDate, date), notInArray(bookings.status, ["cancelada_cliente"])),
  );
  const pending = await classItems(
    db,
    and(eq(bookings.profesorId, profesorId), eq(bookings.status, "agendada"), lt(bookings.startsAt, now)),
  );
  return { today, pending };
}

/** CA-42: clases dictadas del profesor en un rango. */
export async function profesorClasses(db: DB, profesorId: string, from: string, to: string) {
  return classItems(
    db,
    and(eq(bookings.profesorId, profesorId), gte(bookings.localDate, from), lte(bookings.localDate, to), eq(bookings.status, "dictada")),
    "desc",
  );
}

/** CA-41: clases y alquileres en que participó el caddie. */
export async function caddieBookings(db: DB, caddieId: string, from: string, to: string) {
  return classItems(
    db,
    and(eq(bookings.caddieId, caddieId), gte(bookings.localDate, from), lte(bookings.localDate, to), inArray(bookings.status, ["dictada", "usado"])),
    "desc",
  );
}

/** Administrador: todo lo pendiente por cerrar. */
export async function pendingClosures(db: DB, now: Date) {
  return classItems(db, and(eq(bookings.status, "agendada"), lt(bookings.startsAt, now)), "asc");
}

// ---------- Cliente (CA-40) ----------

export type StudentCard = {
  studentId: string;
  childId: string | null;
  name: string;
  isSelf: boolean;
  balances: { individual: number; grupal: number };
};

export async function clientStudents(db: DB, clientId: string, selfName: string): Promise<StudentCard[]> {
  const out: StudentCard[] = [];
  const self = await studentIdOfProfile(db, clientId);
  if (self) out.push({ studentId: self, childId: null, name: selfName, isSelf: true, balances: await balancesOf(db, self) });
  for (const k of await childrenOf(db, clientId)) {
    if (!k.isActive) continue;
    out.push({ studentId: k.studentId, childId: k.id, name: k.fullName, isSelf: false, balances: await balancesOf(db, k.studentId) });
  }
  return out;
}

export type StudentClass = {
  id: string;
  kind: "individual" | "grupal";
  status: Booking["status"];
  localDate: string;
  startsAt: Date;
  court: string;
  profesor: string;
  title: string;
  attendance: boolean | null;
  reason: string | null;
};

/** Clases de un alumno: individuales y, si es niño, las de sus grupos (inscrito o invitado). */
export async function studentClasses(db: DB, studentId: string, childId: string | null, range: { from?: string; to?: string; upcoming?: Date }) {
  const conds = [];
  if (range.from) conds.push(gte(bookings.localDate, range.from));
  if (range.to) conds.push(lte(bookings.localDate, range.to));
  if (range.upcoming) conds.push(gte(bookings.startsAt, range.upcoming), eq(bookings.status, "agendada"));
  else conds.push(notInArray(bookings.status, ["agendada"]));

  const indiv = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      localDate: bookings.localDate,
      startsAt: bookings.startsAt,
      court: courts.name,
      profesor: profiles.fullName,
      reason: cancellationReasons.label,
    })
    .from(bookings)
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .leftJoin(profiles, eq(profiles.id, bookings.profesorId))
    .leftJoin(cancellationReasons, eq(cancellationReasons.id, bookings.cancelReasonId))
    .where(and(eq(bookings.studentId, studentId), eq(bookings.kind, "individual"), ...conds));
  const out: StudentClass[] = indiv.map((r) => ({ ...r, kind: "individual", profesor: r.profesor ?? "", title: "Clase individual", attendance: null, reason: r.reason }));

  if (childId) {
    // Clases de sus grupos en las fechas en que estaba inscrito, o donde figura como participante.
    const memberships = await db.select().from(groupMembers).where(eq(groupMembers.childId, childId));
    const groupIds = [...new Set(memberships.map((m) => m.groupId))];
    const participated = await db
      .select({ bookingId: groupClassParticipants.bookingId, present: groupClassParticipants.present })
      .from(groupClassParticipants)
      .where(eq(groupClassParticipants.childId, childId));
    const partMap = new Map(participated.map((p) => [p.bookingId, p.present]));
    const whereGroup = or(
      groupIds.length ? inArray(bookings.groupId, groupIds) : sql`false`,
      participated.length ? inArray(bookings.id, participated.map((p) => p.bookingId)) : sql`false`,
    );
    const rows = await db
      .select({
        id: bookings.id,
        status: bookings.status,
        localDate: bookings.localDate,
        startsAt: bookings.startsAt,
        groupId: bookings.groupId,
        court: courts.name,
        profesor: profiles.fullName,
        group: groups.name,
        reason: cancellationReasons.label,
      })
      .from(bookings)
      .innerJoin(courts, eq(courts.id, bookings.courtId))
      .innerJoin(groups, eq(groups.id, bookings.groupId))
      .leftJoin(profiles, eq(profiles.id, bookings.profesorId))
      .leftJoin(cancellationReasons, eq(cancellationReasons.id, bookings.cancelReasonId))
      .where(and(eq(bookings.kind, "grupal"), whereGroup, ...conds));
    for (const r of rows) {
      const inList = partMap.has(r.id);
      const member = memberships.some(
        (m) => m.groupId === r.groupId && m.joinedOn <= r.localDate && (!m.leftOn || m.leftOn > r.localDate),
      );
      // Una vez cerrada, cuenta la lista guardada al cerrar.
      if (r.status === "dictada" && !inList) continue;
      if (r.status !== "dictada" && !member && !inList) continue;
      out.push({
        id: r.id,
        kind: "grupal",
        status: r.status,
        localDate: r.localDate,
        startsAt: r.startsAt,
        court: r.court,
        profesor: r.profesor ?? "",
        title: `Grupo ${r.group}`,
        attendance: inList ? (partMap.get(r.id) ?? null) : null,
        reason: r.reason,
      });
    }
  }
  return out.sort((a, b) => (range.upcoming ? a.startsAt.getTime() - b.startsAt.getTime() : b.startsAt.getTime() - a.startsAt.getTime()));
}

export async function clientRentals(db: DB, clientId: string, from?: string) {
  const rows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      localDate: bookings.localDate,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      turns: bookings.turns,
      nightTurns: bookings.nightTurns,
      court: courts.name,
    })
    .from(bookings)
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .where(and(eq(bookings.kind, "alquiler"), eq(bookings.clientId, clientId), from ? gte(bookings.localDate, from) : undefined))
    .orderBy(desc(bookings.startsAt));
  const accounts = await rentalAccounts(db, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, account: accounts.get(r.id)! }));
}

export async function clientPayments(db: DB, studentIds: string[]) {
  const out: (Awaited<ReturnType<typeof paymentsOfStudent>>[number] & { studentId: string })[] = [];
  for (const s of studentIds) for (const p of await paymentsOfStudent(db, s)) out.push({ ...p, studentId: s });
  return out;
}

export async function clientRentalPayments(db: DB, clientId: string) {
  return db
    .select({ id: payments.id, paidOn: payments.paidOn, amount: payments.amount, method: payments.method, status: payments.status })
    .from(payments)
    .where(and(eq(payments.payerId, clientId), eq(payments.kind, "alquiler")))
    .orderBy(desc(payments.paidOn));
}

