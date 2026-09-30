"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEV_COOKIE, devAuthEnabled } from "@/lib/dev-auth";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { supabaseServer } from "@/lib/supabase/server";
import type { ActionState } from "@/server/action";

/** CA-01: correo y contraseña; con datos incorrectos no da acceso y lo indica. */
export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "Escribe tu correo y tu contraseña." };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.message?.toLowerCase().includes("banned")) return { error: "Tu usuario está desactivado. Habla con la administración." };
    return { error: "Correo o contraseña incorrectos." };
  }
  const [p] = await getDb().select().from(profiles).where(eq(profiles.id, data.user.id));
  if (!p || !p.isActive) {
    await supabase.auth.signOut();
    return { error: "Tu usuario está desactivado. Habla con la administración." };
  }
  redirect(p.mustChangePassword ? "/cambiar-contrasena" : "/");
}

export async function devLogin(userId: string) {
  if (!devAuthEnabled()) return;
  (await cookies()).set(DEV_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
}

export async function logout() {
  if (devAuthEnabled()) {
    (await cookies()).delete(DEV_COOKIE);
    redirect("/login");
  }
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
