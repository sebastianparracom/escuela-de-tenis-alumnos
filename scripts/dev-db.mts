/**
 * Base de datos local para desarrollo: Postgres en memoria (PGlite) con las migraciones y los datos
 * de prueba, expuesta en 127.0.0.1:5433. Se usa con DEV_AUTH=1 (ver .env.development.local).
 */
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import type { DB } from "../src/db/types";
import { seedTestData } from "../src/server/seed";

async function main() {
  const pg = new PGlite({ extensions: { btree_gist } });
  const db = drizzle(pg, { schema }) as unknown as DB;
  await migrate(drizzle(pg), { migrationsFolder: "src/db/migrations" });
  const fake = { createUser: async () => randomUUID(), setPassword: async () => {}, setEmail: async () => {}, setBanned: async () => {} };
  const r = await seedTestData({ db, actor: { id: "00000000-0000-0000-0000-000000000000", roles: ["admin"] }, now: new Date() }, fake);
  const server = new PGLiteSocketServer({ db: pg, port: 5433, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  console.log(`Base local lista en ${server.getServerConn()} · ${r.emails.length} usuarios de prueba`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
