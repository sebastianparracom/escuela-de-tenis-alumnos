"use server";

import { redirect } from "next/navigation";
import { DomainError } from "@/lib/errors";
import { num, run, str, type ActionState } from "@/server/action";
import { createIndividualClass, createRental } from "@/server/bookings";
import { ctxOf, requireUser } from "@/server/session";

export async function newBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "profesor", "cliente"]);
  let id = "";
  const res = await run(async () => {
    const ctx = await ctxOf(user);
    const base = { courtId: num(fd, "courtId") ?? 0, date: str(fd, "date"), startMin: num(fd, "startMin") ?? -1 };
    if (str(fd, "kind") === "alquiler") {
      const b = await createRental(ctx, { ...base, turns: num(fd, "turns") ?? 1, clientId: str(fd, "clientId") || undefined });
      id = b.id;
    } else {
      const studentId = str(fd, "studentId");
      if (!studentId) throw new DomainError("Escoge el alumno.");
      const b = await createIndividualClass(ctx, { ...base, studentId, profesorId: str(fd, "profesorId") || undefined });
      id = b.id;
    }
  });
  if (res?.ok) redirect(`/reservas/${id}?nueva=1`);
  return res;
}
