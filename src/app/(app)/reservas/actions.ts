"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/lib/errors";
import { num, run, str, strs, type ActionState } from "@/server/action";
import {
  addGuest,
  assignCaddie,
  cancelRental,
  changeOccurrenceProfesor,
  closeClass,
  closeRental,
  correctClosure,
  removeGuest,
} from "@/server/bookings";
import { ctxOf, requireUser } from "@/server/session";

async function ctx() {
  return ctxOf(await requireUser());
}

function done(id: string) {
  revalidatePath(`/reservas/${id}`);
}

export async function closeClassAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const outcome = str(fd, "outcome") === "cancelada" ? "cancelada" : "dictada";
    await closeClass(await ctx(), id, {
      outcome,
      reasonId: num(fd, "reasonId"),
      caddieId: outcome === "dictada" ? str(fd, "caddieId") || null : undefined,
      presentChildIds: strs(fd, "present"),
    });
    done(id);
    return outcome === "dictada" ? "Clase cerrada como dictada." : "Clase cancelada.";
  });
}

export async function closeRentalAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const outcome = str(fd, "outcome") === "no_usado" ? "no_usado" : "usado";
    await closeRental(await ctx(), id, { outcome, caddieId: str(fd, "caddieId") || null, reasonId: num(fd, "reasonId") });
    done(id);
    return outcome === "usado" ? "Alquiler cerrado como usado." : "Alquiler cerrado como no usado.";
  });
}

export async function cancelRentalAction(id: string, _: ActionState): Promise<ActionState> {
  void _;
  return run(async () => {
    await cancelRental(await ctx(), id);
    done(id);
    return "Reserva cancelada. El turno quedó libre.";
  });
}

export async function assignCaddieAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await assignCaddie(await ctx(), id, str(fd, "caddieId") || null);
    done(id);
    return "Caddie actualizado.";
  });
}

export async function addGuestAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const childId = str(fd, "childId");
    if (!childId) throw new DomainError("Escoge el niño.");
    await addGuest(await ctx(), id, childId);
    done(id);
    return "Niño agregado a la clase.";
  });
}

export async function removeGuestAction(id: string, childId: string, _: ActionState): Promise<ActionState> {
  void _;
  return run(async () => {
    await removeGuest(await ctx(), id, childId);
    done(id);
  });
}

export async function changeProfesorAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await changeOccurrenceProfesor(await ctx(), id, str(fd, "profesorId"));
    done(id);
    return "Profesor de la clase actualizado.";
  });
}

export async function correctAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await correctClosure(
      await ctx(),
      id,
      {
        status: str(fd, "status") as "dictada" | "cancelada" | "usado" | "no_usado",
        caddieId: str(fd, "caddieId") || null,
        reasonId: num(fd, "reasonId"),
        presentChildIds: strs(fd, "present"),
      },
      str(fd, "why"),
    );
    done(id);
    return "Corrección guardada. Bolsas y sesiones ajustadas.";
  });
}
