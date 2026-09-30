"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DomainError } from "@/lib/errors";
import { num, run, str, strs, type ActionState } from "@/server/action";
import { addMember, createGroup, removeMember, setGroupSchedule, updateGroup, type GroupDay } from "@/server/groups";
import { ctxOf, requireUser } from "@/server/session";

async function adminCtx() {
  return ctxOf(await requireUser(["admin"]));
}

function days(fd: FormData): GroupDay[] {
  try {
    const v = JSON.parse(str(fd, "days") || "[]");
    return Array.isArray(v) ? v.map((d) => ({ weekday: Number(d.weekday), startMin: Number(d.startMin), courtId: Number(d.courtId) })) : [];
  } catch {
    throw new DomainError("Horario inválido.");
  }
}

export async function createGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = 0;
  const res = await run(async () => {
    id = await createGroup(await adminCtx(), {
      name: str(fd, "name"),
      code: str(fd, "code"),
      profesorId: str(fd, "profesorId"),
      capacity: num(fd, "capacity"),
      startDate: str(fd, "startDate"),
      endDate: str(fd, "endDate") || null,
      days: days(fd),
      childIds: strs(fd, "children"),
    });
  });
  if (res?.ok) redirect(`/grupos/${id}?creado=1`);
  return res;
}

export async function updateGroupAction(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await updateGroup(await adminCtx(), id, {
      name: str(fd, "name"),
      code: str(fd, "code"),
      profesorId: str(fd, "profesorId"),
      capacity: num(fd, "capacity"),
      endDate: str(fd, "endDate") || null,
      isActive: str(fd, "isActive") === "1",
    });
    revalidatePath(`/grupos/${id}`);
    return "Grupo actualizado.";
  });
}

export async function scheduleAction(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await setGroupSchedule(await adminCtx(), id, str(fd, "fromDate"), days(fd));
    revalidatePath(`/grupos/${id}`);
    return "Horario actualizado. Las clases desde esa fecha quedaron reservadas con el nuevo horario.";
  });
}

export async function addMemberAction(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const childId = str(fd, "childId");
    if (!childId) throw new DomainError("Escoge el niño.");
    await addMember(await adminCtx(), id, childId, str(fd, "fromDate"));
    revalidatePath(`/grupos/${id}`);
    return "Niño inscrito.";
  });
}

export async function removeMemberAction(id: number, childId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await removeMember(await adminCtx(), id, childId, str(fd, "onDate"));
    revalidatePath(`/grupos/${id}`);
    return "Niño retirado del grupo.";
  });
}
