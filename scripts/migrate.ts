import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import "./env";
import { databaseUrl } from "../src/lib/db-url";

/** Aplica las migraciones pendientes. Corre en cada despliegue de Vercel (vercel-build). */
async function run(url: string) {
  const client = postgres(url, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "src/db/migrations" });
  } finally {
    await client.end();
  }
}

async function main() {
  const urls = [...new Set([databaseUrl(true), databaseUrl(false)].filter(Boolean) as string[])];
  const names = Object.keys(process.env).filter((k) => /POSTGRES|SUPABASE|CRON/.test(k));
  console.log(`Variables disponibles: ${names.map((k) => `${k}(${process.env[k]?.length ?? 0})`).join(", ") || "ninguna"}`);
  if (urls.length === 0) {
    console.log("Sin variables de base de datos: se omiten las migraciones.");
    return;
  }
  let last: unknown;
  for (const url of urls) {
    try {
      await run(url);
      console.log("Migraciones aplicadas.");
      return;
    } catch (e) {
      last = e;
      console.warn(`No se pudo migrar con una de las conexiones: ${(e as Error).message}`);
    }
  }
  throw last;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
