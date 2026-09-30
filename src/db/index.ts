import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import type { DB } from "./types";
import { databaseUrl } from "@/lib/db-url";
import { devAuthEnabled } from "@/lib/dev-auth";

declare global {
  var __pg: ReturnType<typeof postgres> | undefined;
}

function connectionString() {
  const url = databaseUrl();
  if (!url) throw new Error("Falta la variable POSTGRES_URL con la conexión a la base de datos.");
  return url;
}

let instance: DB | undefined;

/** Conexión por el pooler de Supabase (modo transacción: sin sentencias preparadas). */
export function getDb(): DB {
  if (!instance) {
    const client = globalThis.__pg ?? postgres(connectionString(), { prepare: false, max: devAuthEnabled() ? 1 : 5 });
    if (process.env.NODE_ENV !== "production") globalThis.__pg = client;
    instance = drizzle(client, { schema }) as unknown as DB;
  }
  return instance;
}
