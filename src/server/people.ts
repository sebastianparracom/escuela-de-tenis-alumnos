import { and, asc, eq, gte, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { bookings, childGuardians, children, groupMembers, profiles, students, userRoles } from "@/db/schema";
import type { DB } from "@/db/types";
import { assert, DomainError } from "@/lib/errors";
import { localDate } from "@/lib/time";
import { audit } from "./audit";
import { INACTIVE_STATUSES, requireAdmin } from "./config";
import type { Ctx, Role } from "./context";

/** Operaciones sobre Supabase Auth. Se inyecta para poder probar sin Supabase. */
export interface AuthAdmin {
  createUser(email: string, password: string): Promise<string>;
  setPassword(userId: string, password: string): Promise<void>;
  setEmail(userId: string, email: string): Promise<void>;
  setBanned(userId: string, banned: boolean): Promise<void>;
}

export const ROLES: Role[] = ["admin", "profesor", "caddie", "cliente"];
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  profesor: "Profesor",
  caddie: "Caddie",
  cliente: "Cliente",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePassword(pw: string) {
  assert(pw.length >= 8, "La contraseña debe tener al menos 8 caracteres.");
}

export type UserInput = {
  fullName: string;
  email: string;
  phone: string;
  document?: string | null;
  roles: Role[];
  /** Valor por sesión como profesor y como caddie (D-43). */
  profesorRate?: number | null;
  caddieRate?: number | null;
  photoPath?: string | null;
};

function cleanUser(input: UserInput) {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  assert(fullName, "El nombre es obligatorio.");
  assert(EMAIL_RE.test(email), "El correo no es válido.");
  const roles = [...new Set(input.roles)].filter((r) => ROLES.includes(r));
  assert(roles.length > 0, "Asigna al menos un rol."); // CA-02
  for (const r of [input.profesorRate, input.caddieRate]) {
    if (r != null) assert(Number.isInteger(r) && r >= 0, "El valor por sesión debe ser un valor en pesos.");
  }
  return { fullName, email, phone: input.phone.trim(), document: input.document?.trim() || null, roles };
}

async function ensureStudentForProfile(db: DB, profileId: string) {
  await db.insert(students).values({ profileId }).onConflictDoNothing();
}

/** CA-02: solo un administrador crea usuarios y les asigna roles. */
export async function createUser(ctx: Ctx, auth: AuthAdmin, input: UserInput & { password: string; isTest?: boolean }) {
  requireAdmin(ctx);
  const u = cleanUser(input);
  validatePassword(input.password);
  const [dup] = await ctx.db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, u.email));
  assert(!dup, "Ya existe un usuario con ese correo.");
  const id = await auth.createUser(u.email, input.password);
  await ctx.db.insert(profiles).values({
    id,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    document: u.document,
    photoPath: input.photoPath ?? null,
    profesorRate: input.profesorRate ?? null,
    caddieRate: input.caddieRate ?? null,
    mustChangePassword: true, // D-02
    isTest: input.isTest ?? false,
    createdAt: ctx.now,
  });
  await ctx.db.insert(userRoles).values(u.roles.map((role) => ({ userId: id, role })));
  if (u.roles.includes("cliente")) await ensureStudentForProfile(ctx.db, id);
  await audit(ctx, "crear", "usuario", id, { ...u, password: undefined });
  return id;
}

export async function updateUser(ctx: Ctx, auth: AuthAdmin, id: string, input: UserInput) {
  requireAdmin(ctx);
  const u = cleanUser(input);
  const [current] = await ctx.db.select().from(profiles).where(eq(profiles.id, id));
  assert(current, "El usuario no existe.");
  if (u.email !== current.email) {
    const [dup] = await ctx.db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, u.email));
    assert(!dup, "Ya existe un usuario con ese correo.");
    await auth.setEmail(id, u.email);
  }
  if (id === ctx.actor.id) assert(u.roles.includes("admin"), "No puedes quitarte a ti mismo el rol de administrador.");
  await ctx.db
    .update(profiles)
    .set({
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      document: u.document,
      profesorRate: input.profesorRate ?? null,
      caddieRate: input.caddieRate ?? null,
      ...(input.photoPath !== undefined ? { photoPath: input.photoPath } : {}),
    })
    .where(eq(profiles.id, id));
  await ctx.db.delete(userRoles).where(eq(userRoles.userId, id));
  await ctx.db.insert(userRoles).values(u.roles.map((role) => ({ userId: id, role })));
  if (u.roles.includes("cliente")) await ensureStudentForProfile(ctx.db, id);
  await audit(ctx, "actualizar", "usuario", id, u);
}

async function futureBookingsOf(db: DB, now: Date, where: ReturnType<typeof or>) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(gte(bookings.startsAt, now), notInArray(bookings.status, [...INACTIVE_STATUSES]), where));
  return row.n;
}

/** CA-04 y D-04: desactivar exige cancelar antes las reservas futuras; el historial se conserva. */
export async function setUserActive(ctx: Ctx, auth: AuthAdmin, id: string, active: boolean) {
  requireAdmin(ctx);
  assert(id !== ctx.actor.id || active, "No puedes desactivar tu propio usuario.");
  if (!active) {
    const [st] = await ctx.db.select({ id: students.id }).from(students).where(eq(students.profileId, id));
    const n = await futureBookingsOf(
      ctx.db,
      ctx.now,
      or(
        eq(bookings.profesorId, id),
        eq(bookings.caddieId, id),
        eq(bookings.clientId, id),
        st ? eq(bookings.studentId, st.id) : sql`false`,
      ),
    );
    if (n > 0) throw new DomainError(`Tiene ${n} reservas o clases futuras. Cancélalas antes de desactivar el usuario.`);
  }
  await auth.setBanned(id, !active);
  await ctx.db.update(profiles).set({ isActive: active }).where(eq(profiles.id, id));
  await audit(ctx, active ? "activar" : "desactivar", "usuario", id);
}

/** CA-05: el administrador restablece la contraseña; el usuario debe cambiarla al entrar. */
export async function resetPassword(ctx: Ctx, auth: AuthAdmin, id: string, password: string) {
  requireAdmin(ctx);
  validatePassword(password);
  await auth.setPassword(id, password);
  await ctx.db.update(profiles).set({ mustChangePassword: true }).where(eq(profiles.id, id));
  await audit(ctx, "restablecer_contrasena", "usuario", id);
}

/** El propio usuario cambia su contraseña (D-02). */
export async function changeOwnPassword(ctx: Ctx, auth: AuthAdmin, password: string, confirm: string) {
  validatePassword(password);
  assert(password === confirm, "Las contraseñas no coinciden.");
  await auth.setPassword(ctx.actor.id, password);
  await ctx.db.update(profiles).set({ mustChangePassword: false }).where(eq(profiles.id, ctx.actor.id));
  await audit(ctx, "cambiar_contrasena", "usuario", ctx.actor.id);
}

// ---------- Niños ----------

export type ChildInput = {
  fullName: string;
  birthDate?: string | null;
  emergencyName: string;
  emergencyPhone: string;
  notes?: string | null;
  guardianIds: string[];
  photoPath?: string | null;
};

async function validGuardians(db: DB, ids: string[]) {
  const unique = [...new Set(ids)];
  assert(unique.length > 0, "El niño debe estar a cargo de al menos un cliente."); // CA-03
  const rows = await db
    .select({ id: userRoles.userId })
    .from(userRoles)
    .where(and(inArray(userRoles.userId, unique), eq(userRoles.role, "cliente")));
  assert(rows.length === unique.length, "Solo se puede vincular a clientes.");
  return unique;
}

export async function createChild(ctx: Ctx, input: ChildInput & { isTest?: boolean }) {
  requireAdmin(ctx);
  const fullName = input.fullName.trim();
  assert(fullName, "El nombre es obligatorio.");
  const guardians = await validGuardians(ctx.db, input.guardianIds);
  const [c] = await ctx.db
    .insert(children)
    .values({
      fullName,
      birthDate: input.birthDate || null,
      emergencyName: input.emergencyName.trim(),
      emergencyPhone: input.emergencyPhone.trim(),
      notes: input.notes?.trim() || null,
      photoPath: input.photoPath ?? null,
      isTest: input.isTest ?? false,
      createdAt: ctx.now,
    })
    .returning();
  await ctx.db.insert(childGuardians).values(guardians.map((clientId) => ({ childId: c.id, clientId })));
  await ctx.db.insert(students).values({ childId: c.id });
  await audit(ctx, "crear", "nino", c.id, input);
  return c.id;
}

export async function updateChild(ctx: Ctx, id: string, input: ChildInput) {
  requireAdmin(ctx);
  const fullName = input.fullName.trim();
  assert(fullName, "El nombre es obligatorio.");
  const guardians = await validGuardians(ctx.db, input.guardianIds);
  await ctx.db
    .update(children)
    .set({
      fullName,
      birthDate: input.birthDate || null,
      emergencyName: input.emergencyName.trim(),
      emergencyPhone: input.emergencyPhone.trim(),
      notes: input.notes?.trim() || null,
      ...(input.photoPath !== undefined ? { photoPath: input.photoPath } : {}),
    })
    .where(eq(children.id, id));
  await ctx.db.delete(childGuardians).where(eq(childGuardians.childId, id));
  await ctx.db.insert(childGuardians).values(guardians.map((clientId) => ({ childId: id, clientId })));
  await audit(ctx, "actualizar", "nino", id, input);
}

export async function setChildActive(ctx: Ctx, id: string, active: boolean) {
  requireAdmin(ctx);
  if (!active) {
    const [st] = await ctx.db.select({ id: students.id }).from(students).where(eq(students.childId, id));
    const n = await futureBookingsOf(ctx.db, ctx.now, or(eq(bookings.studentId, st.id)));
    if (n > 0) throw new DomainError(`Tiene ${n} clases individuales futuras. Cancélalas antes de desactivarlo.`);
    // D-04: sale de sus grupos.
    await ctx.db
      .update(groupMembers)
      .set({ leftOn: localDate(ctx.now) })
      .where(and(eq(groupMembers.childId, id), isNull(groupMembers.leftOn)));
  }
  await ctx.db.update(children).set({ isActive: active }).where(eq(children.id, id));
  await audit(ctx, active ? "activar" : "desactivar", "nino", id);
}

// ---------- Consultas ----------

export async function rolesOf(db: DB, userId: string): Promise<Role[]> {
  const rows = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role);
}

export async function usersWithRole(db: DB, role: Role, activeOnly = true) {
  const rows = await db
    .select({ id: profiles.id, fullName: profiles.fullName, isActive: profiles.isActive })
    .from(profiles)
    .innerJoin(userRoles, and(eq(userRoles.userId, profiles.id), eq(userRoles.role, role)))
    .orderBy(asc(profiles.fullName));
  return activeOnly ? rows.filter((r) => r.isActive) : rows;
}

export type StudentOption = { studentId: string; name: string; kind: "cliente" | "nino" };

/** CA-14: lista de alumnos activos con solo el nombre (sin teléfono ni correo). */
export async function activeStudents(db: DB): Promise<StudentOption[]> {
  const clients = await db
    .select({ studentId: students.id, name: profiles.fullName })
    .from(students)
    .innerJoin(profiles, eq(profiles.id, students.profileId))
    .innerJoin(userRoles, and(eq(userRoles.userId, profiles.id), eq(userRoles.role, "cliente")))
    .where(eq(profiles.isActive, true));
  const kids = await db
    .select({ studentId: students.id, name: children.fullName })
    .from(students)
    .innerJoin(children, eq(children.id, students.childId))
    .where(eq(children.isActive, true));
  return [
    ...clients.map((c) => ({ ...c, kind: "cliente" as const })),
    ...kids.map((k) => ({ ...k, kind: "nino" as const })),
  ].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export type StudentInfo = {
  id: string;
  name: string;
  kind: "cliente" | "nino";
  profileId: string | null;
  childId: string | null;
  isActive: boolean;
};

export async function studentInfo(db: DB, studentId: string): Promise<StudentInfo> {
  const [row] = await db
    .select({
      id: students.id,
      profileId: students.profileId,
      childId: students.childId,
      pName: profiles.fullName,
      pActive: profiles.isActive,
      cName: children.fullName,
      cActive: children.isActive,
    })
    .from(students)
    .leftJoin(profiles, eq(profiles.id, students.profileId))
    .leftJoin(children, eq(children.id, students.childId))
    .where(eq(students.id, studentId));
  if (!row) throw new DomainError("El alumno no existe.");
  return {
    id: row.id,
    name: (row.pName ?? row.cName)!,
    kind: row.profileId ? "cliente" : "nino",
    profileId: row.profileId,
    childId: row.childId,
    isActive: Boolean(row.profileId ? row.pActive : row.cActive),
  };
}

export async function studentIdOfProfile(db: DB, profileId: string) {
  const [row] = await db.select({ id: students.id }).from(students).where(eq(students.profileId, profileId));
  return row?.id ?? null;
}

export async function studentIdOfChild(db: DB, childId: string) {
  const [row] = await db.select({ id: students.id }).from(students).where(eq(students.childId, childId));
  return row?.id ?? null;
}

/** Niños a cargo de un cliente (CA-06, CA-40). */
export async function childrenOf(db: DB, clientId: string) {
  return db
    .select({ id: children.id, fullName: children.fullName, isActive: children.isActive, studentId: students.id })
    .from(childGuardians)
    .innerJoin(children, eq(children.id, childGuardians.childId))
    .innerJoin(students, eq(students.childId, children.id))
    .where(eq(childGuardians.clientId, clientId))
    .orderBy(asc(children.fullName));
}

/** ¿Puede este cliente ver/pagar por este alumno? Él mismo o un niño a su cargo (CA-23, supuesto 4). */
export async function clientCanActFor(db: DB, clientId: string, studentId: string) {
  const st = await studentInfo(db, studentId);
  if (st.profileId) return st.profileId === clientId;
  const [g] = await db
    .select()
    .from(childGuardians)
    .where(and(eq(childGuardians.childId, st.childId!), eq(childGuardians.clientId, clientId)));
  return Boolean(g);
}

// ---------- Listados de administración ----------

export async function listUsers(db: DB) {
  const rows = await db
    .select({ id: profiles.id, fullName: profiles.fullName, email: profiles.email, phone: profiles.phone, isActive: profiles.isActive, photoPath: profiles.photoPath, role: userRoles.role })
    .from(profiles)
    .leftJoin(userRoles, eq(userRoles.userId, profiles.id))
    .orderBy(asc(profiles.fullName));
  const map = new Map<string, { id: string; fullName: string; email: string; phone: string; isActive: boolean; photoPath: string | null; roles: Role[] }>();
  for (const r of rows) {
    const cur = map.get(r.id) ?? { id: r.id, fullName: r.fullName, email: r.email, phone: r.phone, isActive: r.isActive, photoPath: r.photoPath, roles: [] };
    if (r.role) cur.roles.push(r.role);
    map.set(r.id, cur);
  }
  return [...map.values()];
}

export async function listChildren(db: DB) {
  const rows = await db
    .select({ id: children.id, fullName: children.fullName, isActive: children.isActive, guardian: profiles.fullName })
    .from(children)
    .leftJoin(childGuardians, eq(childGuardians.childId, children.id))
    .leftJoin(profiles, eq(profiles.id, childGuardians.clientId))
    .orderBy(asc(children.fullName));
  const map = new Map<string, { id: string; fullName: string; isActive: boolean; guardians: string[] }>();
  for (const r of rows) {
    const cur = map.get(r.id) ?? { id: r.id, fullName: r.fullName, isActive: r.isActive, guardians: [] };
    if (r.guardian) cur.guardians.push(r.guardian);
    map.set(r.id, cur);
  }
  return [...map.values()];
}

export async function getUserFull(db: DB, id: string) {
  const [p] = await db.select().from(profiles).where(eq(profiles.id, id));
  if (!p) throw new DomainError("El usuario no existe.");
  return { ...p, roles: await rolesOf(db, id) };
}

export async function getChildFull(db: DB, id: string) {
  const [c] = await db.select().from(children).where(eq(children.id, id));
  if (!c) throw new DomainError("El niño no existe.");
  const guardians = await db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(childGuardians)
    .innerJoin(profiles, eq(profiles.id, childGuardians.clientId))
    .where(eq(childGuardians.childId, id));
  const [st] = await db.select({ id: students.id }).from(students).where(eq(students.childId, id));
  const memberships = await db
    .select({ groupId: groupMembers.groupId, joinedOn: groupMembers.joinedOn, leftOn: groupMembers.leftOn })
    .from(groupMembers)
    .where(eq(groupMembers.childId, id));
  return { ...c, guardians, studentId: st.id, memberships };
}
