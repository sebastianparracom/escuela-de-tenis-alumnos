import { config } from "dotenv";
import { databaseUrl } from "../src/lib/db-url";

config({ path: ".env.local" });
config();

export function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable ${name} (corre: vercel env pull .env.local)`);
  return v;
}

/** Supabase entrega la URL con sslmode; postgres-js lo necesita explícito para la conexión directa. */
export function directUrl() {
  const url = databaseUrl(true);
  if (!url) throw new Error("Falta la conexión a la base de datos (corre: vercel env pull .env.local)");
  return url;
}
