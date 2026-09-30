/** Borra los datos de prueba desde la terminal. Uso: pnpm db:purge-test --confirmar */
import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import type { DB } from "@/db/types";
import { purgeTestData } from "@/server/purge";
import { supabaseSecretKey, supabaseUrl } from "@/lib/supabase/env";
import { directUrl } from "./env";

async function main() {
  if (!process.argv.includes("--confirmar")) {
    console.log("Esto borra todos los datos de prueba. Vuelve a correrlo con --confirmar.");
    return;
  }
  const client = postgres(directUrl(), { max: 1, prepare: false });
  const ids = await purgeTestData(drizzle(client, { schema }) as unknown as DB);
  await client.end();
  const sb = createClient(supabaseUrl(), supabaseSecretKey(), { auth: { persistSession: false } });
  for (const id of ids) await sb.auth.admin.deleteUser(id);
  console.log(`Datos de prueba eliminados (${ids.length} usuarios).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
