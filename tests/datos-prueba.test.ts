import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { bookings, courts, profiles } from "@/db/schema";
import { purgeTestData } from "@/server/purge";
import { hasTestData, seedTestData } from "@/server/seed";
import { ctxFor, fakeAuth, freshDb, makeUser, NOW, ROOT } from "./helpers";

describe("Datos de prueba (D-36)", () => {
  it("se cargan en una escuela vacía y se purgan sin tocar datos reales ni configuración", async () => {
    const db = await freshDb();
    const real = await makeUser(db, ["cliente"], "Cliente Real");
    const r = await seedTestData(ctxFor(db, ROOT, NOW), fakeAuth);
    expect(r.emails).toHaveLength(8);
    expect(await hasTestData(db)).toBe(true);
    await expect(seedTestData(ctxFor(db, ROOT, NOW), fakeAuth)).rejects.toThrow(/Ya hay datos de prueba/);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(bookings);
    expect(n).toBeGreaterThan(4);

    const ids = await purgeTestData(db);
    expect(ids).toHaveLength(8);
    expect(await hasTestData(db)).toBe(false);
    const [{ left }] = await db.select({ left: sql<number>`count(*)::int` }).from(bookings);
    expect(left).toBe(0);
    expect(await db.select().from(profiles).where(eq(profiles.id, real.id))).toHaveLength(1);
    expect(await db.select().from(courts)).toHaveLength(7);
  });
});
