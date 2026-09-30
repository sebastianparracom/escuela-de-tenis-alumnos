"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DomainError } from "@/lib/errors";
import { BUCKET_PHOTOS, supabaseAuthAdmin, uploadFile } from "@/lib/supabase/admin";
import { num, run, str, strs, type ActionState } from "@/server/action";
import type { Role } from "@/server/context";
import { createChild, createUser, resetPassword, setChildActive, setUserActive, updateChild, updateUser } from "@/server/people";
import { ctxOf, requireUser } from "@/server/session";

async function adminCtx() {
  return ctxOf(await requireUser(["admin"]));
}

async function photoFrom(fd: FormData, prefix: string): Promise<string | undefined> {
  const f = fd.get("photo");
  if (!(f instanceof File) || f.size === 0) return undefined;
  if (!f.type.startsWith("image/")) throw new DomainError("La foto debe ser una imagen.");
  if (f.size > 4 * 1024 * 1024) throw new DomainError("La foto no puede pesar más de 4 MB.");
  const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  return uploadFile(BUCKET_PHOTOS, `${prefix}-${Date.now()}.${ext}`, f);
}

function userInput(fd: FormData) {
  return {
    fullName: str(fd, "fullName"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    document: str(fd, "document") || null,
    roles: strs(fd, "roles") as Role[],
    profesorRate: num(fd, "profesorRate"),
    caddieRate: num(fd, "caddieRate"),
  };
}

export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(async () => {
    const ctx = await adminCtx();
    id = await createUser(ctx, supabaseAuthAdmin, { ...userInput(fd), password: str(fd, "password") });
    const photo = await photoFrom(fd, `usuarios/${id}`);
    if (photo) await updateUser(ctx, supabaseAuthAdmin, id, { ...userInput(fd), photoPath: photo });
  });
  if (res?.ok) redirect(`/personas/${id}?creado=1`);
  return res;
}

export async function updateUserAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await adminCtx();
    const photo = await photoFrom(fd, `usuarios/${id}`);
    await updateUser(ctx, supabaseAuthAdmin, id, { ...userInput(fd), ...(photo ? { photoPath: photo } : {}) });
    revalidatePath(`/personas/${id}`);
    return "Datos guardados.";
  });
}

export async function toggleUserAction(id: string, active: boolean, _: ActionState): Promise<ActionState> {
  void _;
  return run(async () => {
    await setUserActive(await adminCtx(), supabaseAuthAdmin, id, active);
    revalidatePath(`/personas/${id}`);
    return active ? "Usuario activado." : "Usuario desactivado. Ya no puede entrar; su historial se conserva.";
  });
}

export async function resetPasswordAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await resetPassword(await adminCtx(), supabaseAuthAdmin, id, str(fd, "password"));
    return "Contraseña restablecida. El usuario deberá cambiarla al entrar.";
  });
}

function childInput(fd: FormData) {
  return {
    fullName: str(fd, "fullName"),
    birthDate: str(fd, "birthDate") || null,
    emergencyName: str(fd, "emergencyName"),
    emergencyPhone: str(fd, "emergencyPhone"),
    notes: str(fd, "notes") || null,
    guardianIds: strs(fd, "guardians"),
  };
}

export async function createChildAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(async () => {
    const ctx = await adminCtx();
    id = await createChild(ctx, childInput(fd));
    const photo = await photoFrom(fd, `ninos/${id}`);
    if (photo) await updateChild(ctx, id, { ...childInput(fd), photoPath: photo });
  });
  if (res?.ok) redirect(`/personas/ninos/${id}?creado=1`);
  return res;
}

export async function updateChildAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await adminCtx();
    const photo = await photoFrom(fd, `ninos/${id}`);
    await updateChild(ctx, id, { ...childInput(fd), ...(photo ? { photoPath: photo } : {}) });
    revalidatePath(`/personas/ninos/${id}`);
    return "Datos guardados.";
  });
}

export async function toggleChildAction(id: string, active: boolean, _: ActionState): Promise<ActionState> {
  void _;
  return run(async () => {
    await setChildActive(await adminCtx(), id, active);
    revalidatePath(`/personas/ninos/${id}`);
    return active ? "Niño activado." : "Niño desactivado. Salió de sus grupos; su historial se conserva.";
  });
}
