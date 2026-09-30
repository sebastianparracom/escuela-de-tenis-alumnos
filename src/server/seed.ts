/**
 * Datos y usuarios de prueba para validar la V1 (D-36). Todo queda marcado con is_test y se
 * elimina con el proceso técnico de purga (src/server/purge.ts) antes de la operación real.
 */
import { eq, inArray, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { DomainError } from "@/lib/errors";
import { addDays, isoWeekday, localDate } from "@/lib/time";
import { createIndividualClass, createRental } from "./bookings";
import { listPackages, loadSchedules, priceForOrNull, savePackage, savePrices } from "./config";
import type { Ctx, Role } from "./context";
import { createGroup } from "./groups";
import { createChild, createUser, studentIdOfChild, studentIdOfProfile, type AuthAdmin } from "./people";
import { registerClassPayment } from "./payments";

/** Contraseña de todos los usuarios de prueba. */
export const TEST_PASSWORD = "Prueba-Tenis-2026";
export const TEST_DOMAIN = "example.com";

export async function hasTestData(db: Ctx["db"]) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.profiles).where(eq(schema.profiles.isTest, true));
  return n > 0;
}

export async function seedTestData(ctx: Ctx, auth: AuthAdmin): Promise<{ emails: string[]; log: string[] }> {
  const db = ctx.db;
  const log: string[] = [];
  const DOMAIN = TEST_DOMAIN;
  const today = localDate(ctx.now);

  if (await hasTestData(db)) throw new DomainError("Ya hay datos de prueba cargados. Primero hay que eliminarlos.");

  // Configuración base (solo si la escuela aún no la tiene).
  // Rigen desde 60 días atrás para poder probar también clases pasadas (D-15).
  const since = addDays(today, -60);
  if ((await loadSchedules(db)).length === 0) {
    const [v] = await db.insert(schema.schedules).values({ effectiveFrom: since, createdBy: ctx.actor.id }).returning();
    await db.insert(schema.scheduleBands).values(
      [
        { calendar: "entre_semana" as const, startMin: 360, endMin: 810, turnMinutes: 45, isNight: false },
        { calendar: "entre_semana" as const, startMin: 810, endMin: 1110, turnMinutes: 60, isNight: false },
        { calendar: "entre_semana" as const, startMin: 1110, endMin: 1290, turnMinutes: 60, isNight: true },
        { calendar: "fin_de_semana" as const, startMin: 420, endMin: 780, turnMinutes: 60, isNight: false },
        { calendar: "fin_de_semana" as const, startMin: 780, endMin: 1080, turnMinutes: 60, isNight: false },
      ].map((b) => ({ ...b, scheduleId: v.id })),
    );
    log.push("Franjas de ejemplo configuradas.");
  }
  if (!(await priceForOrNull(db, today))) {
    await savePrices(ctx, since, { individualDay: 70000, individualNight: 80000, groupSingle: 35000, rentalDay: 50000, rentalNight: 60000, caddieSurcharge: 15000 });
    log.push("Tarifas de ejemplo configuradas.");
  }
  if ((await listPackages(db)).length === 0) {
    for (const p of [
      { name: "Paquete 4 individuales", kind: "individual" as const, classCount: 4, price: 260000 },
      { name: "Paquete 8 individuales", kind: "individual" as const, classCount: 8, price: 480000 },
      { name: "Paquete 4 grupales", kind: "grupal" as const, classCount: 4, price: 120000 },
      { name: "Paquete 8 grupales", kind: "grupal" as const, classCount: 8, price: 220000 },
    ]) {
      await savePackage(ctx, { ...p, isActive: true });
    }
    log.push("Paquetes de ejemplo creados.");
  }

  // Usuarios de prueba (uno o más por rol).
  const people: Record<string, string> = {};
  const mk = async (key: string, fullName: string, roles: Role[], rates: { profesor?: number; caddie?: number } = {}) => {
    const id = await createUser(ctx, auth, {
      fullName,
      email: `${key}.prueba@${DOMAIN}`,
      phone: "3000000000",
      roles,
      profesorRate: rates.profesor ?? null,
      caddieRate: rates.caddie ?? null,
      password: TEST_PASSWORD,
      isTest: true,
    });
    await db.update(schema.profiles).set({ mustChangePassword: false }).where(eq(schema.profiles.id, id));
    people[key] = id;
    return id;
  };
  await mk("admin", "Administrador Prueba", ["admin"]);
  await mk("juan", "Juan Martínez", ["profesor"], { profesor: 30000 });
  await mk("laura", "Laura Vélez", ["profesor"], { profesor: 30000 });
  await mk("andres", "Andrés Pérez", ["caddie"], { caddie: 20000 });
  // Camilo trabaja como caddie y como profesor, con un valor distinto por rol (D-43).
  await mk("camilo", "Camilo Ruiz", ["caddie", "profesor"], { caddie: 20000, profesor: 28000 });
  await mk("carolina", "Carolina Rojas", ["cliente"]);
  await mk("miguel", "Miguel Ortiz", ["cliente"]);
  await mk("paula", "Paula Gómez", ["cliente"]);

  const kid = (name: string, guardians: string[]) =>
    createChild(ctx, { fullName: name, emergencyName: "Contacto de prueba", emergencyPhone: "3000000000", guardianIds: guardians, isTest: true });
  const sofia = await kid("Sofía Rojas", [people.carolina]);
  const tomas = await kid("Tomás Rojas", [people.carolina]);
  const others = [];
  for (const name of ["Martín Ortiz", "Valentina Ruiz", "Samuel Díaz", "Isabella Castro", "Lucía Herrera", "Emilio Vargas", "Mariana Pardo", "Nicolás Díaz"]) {
    others.push(await kid(name, [people.miguel]));
  }

  // Grupo Sub-10: martes y jueves 16:30 en la Cancha 2 con Juan.
  await createGroup(ctx, {
    name: "Sub-10",
    code: "S10",
    profesorId: people.juan,
    capacity: 12,
    startDate: today,
    days: [
      { weekday: 2, startMin: 990, courtId: 2 },
      { weekday: 4, startMin: 990, courtId: 2 },
    ],
    childIds: [sofia, tomas, ...others],
    isTest: true,
  });

  // Pagos.
  const pk = await listPackages(db, true);
  const ind8 = pk.find((p) => p.name === "Paquete 8 individuales")!;
  const grp4 = pk.find((p) => p.name === "Paquete 4 grupales")!;
  const carolinaSt = (await studentIdOfProfile(db, people.carolina))!;
  await registerClassPayment(ctx, { payerId: people.carolina, studentId: carolinaSt, packageId: ind8.id, amount: ind8.price, method: "transferencia", paidOn: today, isTest: true });
  for (const k of [sofia, tomas]) {
    await registerClassPayment(ctx, { payerId: people.carolina, studentId: (await studentIdOfChild(db, k))!, packageId: grp4.id, amount: grp4.price, method: "efectivo", paidOn: today, isTest: true });
  }
  for (const k of others.slice(0, 6)) {
    await registerClassPayment(ctx, { payerId: people.miguel, studentId: (await studentIdOfChild(db, k))!, packageId: grp4.id, amount: grp4.price, method: "efectivo", paidOn: today, isTest: true });
  }

  // Clases individuales y un alquiler en los próximos días hábiles.
  let d = addDays(today, 1);
  while (isoWeekday(d) >= 6) d = addDays(d, 1);
  const juan: Ctx = { ...ctx, actor: { id: people.juan, roles: ["profesor"] } };
  const laura: Ctx = { ...ctx, actor: { id: people.laura, roles: ["profesor"] } };
  const paulaSt = (await studentIdOfProfile(db, people.paula))!;
  const sofiaSt = (await studentIdOfChild(db, sofia))!;
  const created = [
    await createIndividualClass(juan, { courtId: 1, date: d, startMin: 450, studentId: carolinaSt }),
    await createIndividualClass(laura, { courtId: 3, date: d, startMin: 870, studentId: paulaSt }),
    await createIndividualClass(laura, { courtId: 4, date: d, startMin: 930, studentId: sofiaSt }),
    await createRental({ ...ctx, actor: { id: people.paula, roles: ["cliente"] } }, { courtId: 5, date: d, startMin: 1110, turns: 2 }),
  ];
  await db.update(schema.bookings).set({ isTest: true }).where(inArray(schema.bookings.id, created.map((b) => b.id)));

  return { emails: Object.keys(people).map((k) => `${k}.prueba@${DOMAIN}`), log };
}
