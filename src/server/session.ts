import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { cookies } from "next/headers";
import { DEV_COOKIE, devAuthEnabled } from "@/lib/dev-auth";
import { supabaseServer } from "@/lib/supabase/server";
import type { Ctx, Role } from "./context";
import { rolesOf } from "./people";

export type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  roles: Role[];
  mustChangePassword: boolean;
  photoPath: string | null;
};

/** Usuario de la sesión actual, o null. Un usuario desactivado no tiene sesión (CA-04). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  let userId: string | null = null;
  if (devAuthEnabled()) {
    userId = (await cookies()).get(DEV_COOKIE)?.value ?? null;
  } else {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  }
  if (!userId) return null;
  const db = getDb();
  const [p] = await db.select().from(profiles).where(eq(profiles.id, userId));
  if (!p || !p.isActive) return null;
  return {
    id: p.id,
    fullName: p.fullName,
    email: p.email,
    roles: await rolesOf(db, p.id),
    mustChangePassword: p.mustChangePassword,
    photoPath: p.photoPath,
  };
});

export const ROLE_ORDER: Role[] = ["admin", "profesor", "caddie", "cliente"];

export function primaryRole(roles: Role[]): Role {
  return ROLE_ORDER.find((r) => roles.includes(r)) ?? "cliente";
}

export function homeFor(roles: Role[]) {
  const r = primaryRole(roles);
  return r === "admin" ? "/tablero" : r === "profesor" ? "/hoy" : r === "caddie" ? "/sesiones" : "/inicio";
}

/** Exige sesión (y uno de los roles, si se indican). CA-06: cada rol ve solo lo suyo. */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/cambiar-contrasena");
  if (roles && !roles.some((r) => user.roles.includes(r))) redirect(homeFor(user.roles));
  return user;
}

export async function ctxOf(user: SessionUser): Promise<Ctx> {
  return { db: getDb(), actor: { id: user.id, roles: user.roles }, now: new Date() };
}
