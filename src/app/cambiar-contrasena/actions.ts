"use server";

import { redirect } from "next/navigation";
import { supabaseAuthAdmin } from "@/lib/supabase/admin";
import { run, str, type ActionState } from "@/server/action";
import { changeOwnPassword } from "@/server/people";
import { ctxOf, getSessionUser } from "@/server/session";

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const res = await run(async () => {
    await changeOwnPassword(await ctxOf(user), supabaseAuthAdmin, str(fd, "password"), str(fd, "confirm"));
  });
  if (res?.ok) redirect("/");
  return res;
}
