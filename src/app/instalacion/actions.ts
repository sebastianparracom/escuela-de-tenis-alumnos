"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { DomainError } from "@/lib/errors";
import { supabaseAuthAdmin } from "@/lib/supabase/admin";
import { run, str, type ActionState } from "@/server/action";
import { adminCount, validSecret } from "@/server/install";
import { createUser } from "@/server/people";

/** Crea la primera cuenta de administrador. Solo funciona mientras no exista ninguno. */
export async function installAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await run(async () => {
    if (!validSecret(str(fd, "code"))) throw new DomainError("El código de instalación no es correcto.");
    if ((await adminCount()) > 0) throw new DomainError("La escuela ya tiene administrador. Entra con tu cuenta.");
    if (str(fd, "password") !== str(fd, "confirm")) throw new DomainError("Las contraseñas no coinciden.");
    const db = getDb();
    const id = await createUser({ db, actor: { id: "00000000-0000-0000-0000-000000000000", roles: ["admin"] }, now: new Date() }, supabaseAuthAdmin, {
      fullName: str(fd, "fullName"),
      email: str(fd, "email"),
      phone: str(fd, "phone"),
      roles: ["admin"],
      password: str(fd, "password"),
    });
    await db.update(profiles).set({ mustChangePassword: false }).where(eq(profiles.id, id));
  });
  if (res?.ok) redirect("/login?instalado=1");
  return res;
}
