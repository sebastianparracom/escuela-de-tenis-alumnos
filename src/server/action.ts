import "server-only";
import { unstable_rethrow } from "next/navigation";
import { DomainError } from "@/lib/errors";

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;

/** Ejecuta una acción de formulario y convierte los errores de negocio en un mensaje para el usuario. */
export async function run(fn: () => Promise<void | string>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message || undefined };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof DomainError) return { error: e.message };
    if (e instanceof Error && /^(No se pudo|Ya existe)/.test(e.message)) return { error: e.message };
    console.error(e);
    return { error: "Ocurrió un error inesperado. Intenta de nuevo." };
  }
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export function num(fd: FormData, key: string): number | null {
  const v = str(fd, key).replace(/[.\s$]/g, "").trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function strs(fd: FormData, key: string): string[] {
  return fd.getAll(key).filter((v): v is string => typeof v === "string" && v !== "");
}
