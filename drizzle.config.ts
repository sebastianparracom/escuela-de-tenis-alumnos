import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Las migraciones van por la conexión directa (sin pooler).
    url: process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL ?? "",
  },
});
