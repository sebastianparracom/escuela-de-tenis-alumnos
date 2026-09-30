/** Carga los datos de prueba desde la terminal (requiere las llaves en .env.local). */
import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import type { DB } from "@/db/types";
import type { AuthAdmin } from "@/server/people";
import { seedTestData } from "@/server/seed";
import { supabaseSecretKey, supabaseUrl } from "@/lib/supabase/env";
import { directUrl } from "./env";

async function main() {
  const sb = createClient(supabaseUrl(), supabaseSecretKey(), { auth: { persistSession: false } });
  const auth: AuthAdmin = {
    async createUser(email, password) {
      const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`Auth: ${error?.message}`);
      return data.user.id;
    },
    async setPassword() {},
    async setEmail() {},
    async setBanned() {},
  };
  const client = postgres(directUrl(), { max: 1, prepare: false });
  const db = drizzle(client, { schema }) as unknown as DB;
  const r = await seedTestData({ db, actor: { id: "00000000-0000-0000-0000-000000000000", roles: ["admin"] }, now: new Date() }, auth);
  console.log([...r.log, "Usuarios:", ...r.emails].join("\n"));
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
