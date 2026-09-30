import "server-only";
import { timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles, userRoles } from "@/db/schema";

export async function adminCount() {
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(userRoles)
    .innerJoin(profiles, eq(profiles.id, userRoles.userId))
    .where(eq(userRoles.role, "admin"));
  return n;
}

/** Compara con CRON_SECRET sin filtrar información por el tiempo de respuesta. */
export function validSecret(value: string | null | undefined) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
