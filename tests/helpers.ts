import { randomUUID } from "node:crypto";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { DB } from "@/db/types";
import type { Band } from "@/lib/schedule";
import type { Actor, Ctx, Role } from "@/server/context";
import { savePrices, saveSchedule } from "@/server/config";
import { createChild, createUser, type AuthAdmin } from "@/server/people";

let template: PGlite | null = null;

async function getTemplate() {
  if (!template) {
    template = new PGlite({ extensions: { btree_gist } });
    const db = drizzle(template, { schema });
    await migrate(db, { migrationsFolder: path.resolve(__dirname, "../src/db/migrations") });
  }
  return template;
}

/** Base de datos Postgres en memoria con todas las migraciones aplicadas. */
export async function freshDb(): Promise<DB> {
  const t = await getTemplate();
  const pg = (await t.clone()) as PGlite;
  return drizzle(pg, { schema }) as unknown as DB;
}

export const fakeAuth: AuthAdmin = {
  async createUser() {
    return randomUUID();
  },
  async setPassword() {},
  async setEmail() {},
  async setBanned() {},
};

/** Reloj fijo: martes 29 sep 2026, 10:00 hora de Colombia. */
export const NOW = new Date("2026-09-29T15:00:00Z");

export function ctxFor(db: DB, actor: Actor, now: Date = NOW): Ctx {
  return { db, actor, now };
}

export const ROOT: Actor = { id: "00000000-0000-0000-0000-000000000000", roles: ["admin"] };

let counter = 0;
export async function makeUser(db: DB, roles: Role[], name?: string): Promise<Actor> {
  counter++;
  const id = await createUser(ctxFor(db, ROOT), fakeAuth, {
    fullName: name ?? `Persona ${counter}`,
    email: `p${counter}-${randomUUID().slice(0, 6)}@test.co`,
    phone: "3000000000",
    roles,
    password: "clave-segura",
  });
  return { id, roles };
}

export async function makeChild(db: DB, guardianIds: string[], name?: string) {
  counter++;
  return createChild(ctxFor(db, ROOT), {
    fullName: name ?? `Niño ${counter}`,
    emergencyName: "Contacto",
    emergencyPhone: "3000000000",
    guardianIds,
  });
}

/** Franjas del ejemplo E-04 (ajustado a turnos exactos) y fin de semana. */
export const BANDS: Band[] = [
  { calendar: "entre_semana", startMin: 6 * 60, endMin: 13 * 60 + 30, turnMinutes: 45, isNight: false },
  { calendar: "entre_semana", startMin: 13 * 60 + 30, endMin: 18 * 60 + 30, turnMinutes: 60, isNight: false },
  { calendar: "entre_semana", startMin: 18 * 60 + 30, endMin: 21 * 60 + 30, turnMinutes: 60, isNight: true },
  { calendar: "fin_de_semana", startMin: 7 * 60, endMin: 13 * 60, turnMinutes: 60, isNight: false },
  { calendar: "fin_de_semana", startMin: 13 * 60, endMin: 18 * 60, turnMinutes: 60, isNight: false },
];

export const PRICES = {
  individualDay: 70_000,
  individualNight: 80_000,
  groupSingle: 35_000,
  rentalDay: 50_000,
  rentalNight: 60_000,
  caddieSurcharge: 15_000,
};

export async function baseSetup(db: DB) {
  const ctx = ctxFor(db, ROOT, new Date("2026-09-01T12:00:00Z"));
  await saveSchedule(ctx, "2026-09-01", BANDS);
  await savePrices(ctx, "2026-09-01", PRICES);
}
