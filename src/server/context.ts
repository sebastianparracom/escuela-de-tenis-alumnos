import type { DB } from "@/db/types";

export type Role = "admin" | "profesor" | "caddie" | "cliente";

export type Actor = { id: string; roles: Role[] };

/** Todo servicio recibe la base de datos, quién actúa y el reloj (inyectable en pruebas). */
export type Ctx = { db: DB; actor: Actor; now: Date };

export function hasRole(actor: Actor, role: Role) {
  return actor.roles.includes(role);
}

export function isAdmin(actor: Actor) {
  return actor.roles.includes("admin");
}
