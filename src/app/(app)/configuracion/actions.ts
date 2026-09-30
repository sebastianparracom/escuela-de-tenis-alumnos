"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/lib/errors";
import type { Band } from "@/lib/schedule";
import { BUCKET_PUBLIC, supabaseAuthAdmin, uploadFile } from "@/lib/supabase/admin";
import { seedTestData } from "@/server/seed";
import { num, run, str, type ActionState } from "@/server/action";
import { saveCourt, savePackage, savePrices, saveReason, saveSchedule, updateSettings } from "@/server/config";
import { setHolidayOverride } from "@/server/groups";
import { ctxOf, requireUser } from "@/server/session";

async function adminCtx() {
  return ctxOf(await requireUser(["admin"]));
}

export async function schoolAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await adminCtx();
    let logoPath: string | undefined;
    const f = fd.get("logo");
    if (f instanceof File && f.size > 0) {
      if (!f.type.startsWith("image/")) throw new DomainError("El logo debe ser una imagen.");
      if (f.size > 2 * 1024 * 1024) throw new DomainError("El logo no puede pesar más de 2 MB.");
      const ext = (f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      logoPath = await uploadFile(BUCKET_PUBLIC, `logo-${Date.now()}.${ext}`, f);
    }
    await updateSettings(ctx, { schoolName: str(fd, "schoolName"), ...(logoPath ? { logoPath } : {}) });
    revalidatePath("/", "layout");
    return "Datos de la escuela guardados.";
  });
}

export async function paramsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await updateSettings(await adminCtx(), {
      clientMaxDays: num(fd, "clientMaxDays") ?? undefined,
      staffMaxDays: num(fd, "staffMaxDays") ?? undefined,
      clientMaxTurns: num(fd, "clientMaxTurns") ?? undefined,
      payrollFrequency: str(fd, "payrollFrequency") as "semanal" | "quincenal" | "mensual",
    });
    revalidatePath("/configuracion");
    return "Parámetros guardados.";
  });
}

export async function courtAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await saveCourt(await adminCtx(), { id: num(fd, "id") ?? undefined, name: str(fd, "name"), isActive: str(fd, "isActive") !== "0" });
    revalidatePath("/configuracion/canchas");
    return "Cancha guardada.";
  });
}

export async function scheduleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    let bands: Band[];
    try {
      bands = JSON.parse(str(fd, "bands"));
    } catch {
      throw new DomainError("Franjas inválidas.");
    }
    await saveSchedule(await adminCtx(), str(fd, "effectiveFrom"), bands);
    revalidatePath("/configuracion/franjas");
    return "Franjas guardadas.";
  });
}

export async function holidayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const v = str(fd, "value");
    await setHolidayOverride(await adminCtx(), str(fd, "date"), v === "si" ? true : v === "no" ? false : null);
    revalidatePath("/configuracion/festivos");
    return "Calendario actualizado.";
  });
}

export async function pricesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const need = (k: string) => {
      const v = num(fd, k);
      if (v === null) throw new DomainError("Completa todos los precios.");
      return v;
    };
    await savePrices(await adminCtx(), str(fd, "effectiveFrom"), {
      individualDay: need("individualDay"),
      individualNight: need("individualNight"),
      groupSingle: need("groupSingle"),
      rentalDay: need("rentalDay"),
      rentalNight: need("rentalNight"),
      caddieSurcharge: need("caddieSurcharge"),
    });
    revalidatePath("/configuracion/tarifas");
    return "Tarifas guardadas.";
  });
}

export async function packageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await savePackage(await adminCtx(), {
      id: num(fd, "id") ?? undefined,
      name: str(fd, "name"),
      kind: str(fd, "kind") === "grupal" ? "grupal" : "individual",
      classCount: num(fd, "classCount") ?? 0,
      price: num(fd, "price") ?? -1,
      isActive: str(fd, "isActive") !== "0",
    });
    revalidatePath("/configuracion/paquetes");
    return "Paquete guardado.";
  });
}

export async function reasonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await saveReason(await adminCtx(), { id: num(fd, "id") ?? undefined, label: str(fd, "label"), isActive: str(fd, "isActive") !== "0" });
    revalidatePath("/configuracion/motivos");
    return "Motivo guardado.";
  });
}

export async function seedAction(_: ActionState): Promise<ActionState> {
  void _;
  return run(async () => {
    const r = await seedTestData(await adminCtx(), supabaseAuthAdmin);
    revalidatePath("/", "layout");
    return `Datos de prueba cargados. ${r.log.join(" ")} Usuarios: ${r.emails.join(", ")}.`;
  });
}
