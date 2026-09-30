/**
 * Escenarios de prueba del anexo del documento de alcance (E-01 a E-18), a nivel de reglas de negocio.
 * Reloj: martes 29 sep 2026, 10:00 hora de Colombia.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db/types";
import { DomainError } from "@/lib/errors";
import { periodFor } from "@/lib/periods";
import { assignCaddie, closeClass, closeRental, createIndividualClass, createRental, getBooking } from "@/server/bookings";
import { listReasons, saveSchedule, savePackage, turnsForDate } from "@/server/config";
import { createGroup } from "@/server/groups";
import { activeStudents, studentIdOfChild, studentIdOfProfile } from "@/server/people";
import { balancesOf, paymentsOfStudent, registerClassPayment, rentalAccounts } from "@/server/payments";
import { markPayrollPaid, payrollPreview, personSessions } from "@/server/payroll";
import { BANDS, baseSetup, ctxFor, freshDb, makeChild, makeUser, ROOT } from "./helpers";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

const H = (h: number, m = 0) => h * 60 + m;
// Después de la clase, para poder cerrarla como dictada.
const at = (iso: string) => new Date(iso);

let db: DB;
beforeEach(async () => {
  db = await freshDb();
  await baseSetup(db);
});

async function buyIndividual(clientId: string, studentId: string, n: number) {
  const pkg = await savePackage(ctxFor(db, ROOT), { name: `Paquete ${n}`, kind: "individual", classCount: n, price: n * 60_000, isActive: true });
  await registerClassPayment(ctxFor(db, ROOT), { payerId: clientId, studentId, packageId: pkg, amount: n * 60_000, method: "efectivo", paidOn: "2026-09-29" });
}

describe("Agenda y cruces", () => {
  it("E-01 · cruce de cancha: no guarda la reserva e indica que la cancha está ocupada", async () => {
    const p1 = await makeUser(db, ["profesor"]);
    const p2 = await makeUser(db, ["profesor"]);
    const c1 = await makeUser(db, ["cliente"]);
    const c2 = await makeUser(db, ["cliente"]);
    const s1 = (await studentIdOfProfile(db, c1.id))!;
    const s2 = (await studentIdOfProfile(db, c2.id))!;
    await createIndividualClass(ctxFor(db, p1), { courtId: 3, date: "2026-10-06", startMin: H(16, 30), studentId: s1 });
    await expect(
      createIndividualClass(ctxFor(db, p2), { courtId: 3, date: "2026-10-06", startMin: H(16, 30), studentId: s2 }),
    ).rejects.toThrow(/Cancha 3 está ocupada/);
  });

  it("E-02 · cruce de caddie: no permite asignarlo a otra clase a la misma hora", async () => {
    const p1 = await makeUser(db, ["profesor"]);
    const p2 = await makeUser(db, ["profesor"]);
    const caddie = await makeUser(db, ["caddie"], "Andrés Pérez");
    const c1 = await makeUser(db, ["cliente"]);
    const c2 = await makeUser(db, ["cliente"]);
    const a = await createIndividualClass(ctxFor(db, p1), { courtId: 1, date: "2026-10-01", startMin: H(9), studentId: (await studentIdOfProfile(db, c1.id))! });
    const b = await createIndividualClass(ctxFor(db, p2), { courtId: 2, date: "2026-10-01", startMin: H(9), studentId: (await studentIdOfProfile(db, c2.id))! });
    await assignCaddie(ctxFor(db, p1), a.id, caddie.id);
    await expect(assignCaddie(ctxFor(db, p2), b.id, caddie.id)).rejects.toThrow(/caddie Andrés Pérez está ocupado/);
  });

  it("CA-15 · un profesor no puede estar en dos clases a la misma hora", async () => {
    const p = await makeUser(db, ["profesor"]);
    const c1 = await makeUser(db, ["cliente"]);
    const c2 = await makeUser(db, ["cliente"]);
    await createIndividualClass(ctxFor(db, p), { courtId: 1, date: "2026-10-01", startMin: H(9), studentId: (await studentIdOfProfile(db, c1.id))! });
    await expect(
      createIndividualClass(ctxFor(db, p), { courtId: 2, date: "2026-10-01", startMin: H(9), studentId: (await studentIdOfProfile(db, c2.id))! }),
    ).rejects.toThrow(/ya tiene una clase a esa hora/);
  });

  it("E-03 · el profesor ve nombres de clientes y niños, sin teléfono ni correo", async () => {
    const c = await makeUser(db, ["cliente"], "Carolina Rojas");
    await makeChild(db, [c.id], "Sofía Rojas");
    const list = await activeStudents(db);
    expect(list.map((s) => s.name)).toEqual(["Carolina Rojas", "Sofía Rojas"]);
    for (const s of list) expect(Object.keys(s).sort()).toEqual(["kind", "name", "studentId"]);
  });

  it("E-04 · franjas: turnos de 45 y de 60 minutos un miércoles", async () => {
    const { calendar, turns } = await turnsForDate(db, "2026-09-30");
    expect(calendar).toBe("entre_semana");
    expect(turns.filter((t) => t.endMin - t.startMin === 45)).toHaveLength(10);
    expect(turns.filter((t) => t.endMin - t.startMin === 60)).toHaveLength(8);
    expect(turns[0]).toEqual({ startMin: H(6), endMin: H(6, 45), isNight: false });
  });

  it("E-05 · cambio de franja con reservas: no acepta la fecha", async () => {
    const c = await makeUser(db, ["cliente"]);
    await createRental(ctxFor(db, c), { courtId: 1, date: "2026-10-03", startMin: H(8), turns: 1 });
    const nuevo = BANDS.map((b) => (b.calendar === "fin_de_semana" && b.startMin === H(7) ? { ...b, startMin: H(6), endMin: H(13) } : b));
    await expect(saveSchedule(ctxFor(db, ROOT), "2026-10-03", nuevo)).rejects.toThrow(/hay reservas dentro de las franjas que cambian/);
    // Una fecha posterior a la reserva sí se acepta.
    await expect(saveSchedule(ctxFor(db, ROOT), "2026-10-04", nuevo)).resolves.toBeTypeOf("number");
  });

  it("E-15 · alquiler de dos turnos seguidos: confirmado sin pago y en la agenda", async () => {
    const c = await makeUser(db, ["cliente"]);
    const r = await createRental(ctxFor(db, c), { courtId: 4, date: "2026-10-01", startMin: H(18, 30), turns: 2 });
    expect(r.status).toBe("agendada");
    expect(r.turns).toBe(2);
    expect(r.nightTurns).toBe(2);
    const acc = (await rentalAccounts(db, [r.id])).get(r.id)!;
    expect(acc).toMatchObject({ value: 120_000, paid: 0 });
    // Otro cliente no puede reservar el segundo turno.
    const c2 = await makeUser(db, ["cliente"]);
    await expect(createRental(ctxFor(db, c2), { courtId: 4, date: "2026-10-01", startMin: H(19, 30), turns: 1 })).rejects.toThrow(/ocupada/);
  });
});

describe("Pagos y bolsas", () => {
  it("E-06 · paquete individual de 8 clases: la bolsa queda en 8 y el pago aparece", async () => {
    const c = await makeUser(db, ["cliente"]);
    const s = (await studentIdOfProfile(db, c.id))!;
    await buyIndividual(c.id, s, 8);
    expect((await balancesOf(db, s)).individual).toBe(8);
    expect(await paymentsOfStudent(db, s)).toHaveLength(1);
  });

  it("E-07 · paquete grupal para una hija: su bolsa grupal queda en 4 y la del cliente no cambia", async () => {
    const c = await makeUser(db, ["cliente"]);
    const hija = await makeChild(db, [c.id]);
    const sh = (await studentIdOfChild(db, hija))!;
    const sc = (await studentIdOfProfile(db, c.id))!;
    const pkg = await savePackage(ctxFor(db, ROOT), { name: "Grupal 4", kind: "grupal", classCount: 4, price: 120_000, isActive: true });
    await registerClassPayment(ctxFor(db, ROOT), { payerId: c.id, studentId: sh, packageId: pkg, amount: 120_000, method: "transferencia", paidOn: "2026-09-29" });
    expect(await balancesOf(db, sh)).toEqual({ individual: 0, grupal: 4 });
    expect(await balancesOf(db, sc)).toEqual({ individual: 0, grupal: 0 });
  });

  it("E-08 · clases grupales para un adulto: no lo permite", async () => {
    const c = await makeUser(db, ["cliente"]);
    const sc = (await studentIdOfProfile(db, c.id))!;
    const pkg = await savePackage(ctxFor(db, ROOT), { name: "Grupal 4", kind: "grupal", classCount: 4, price: 120_000, isActive: true });
    await expect(
      registerClassPayment(ctxFor(db, ROOT), { payerId: c.id, studentId: sc, packageId: pkg, amount: 1, method: "efectivo", paidOn: "2026-09-29" }),
    ).rejects.toThrow(/solo se pueden comprar para niños/);
    await expect(
      registerClassPayment(ctxFor(db, ROOT), { payerId: c.id, studentId: sc, looseType: "grupal", quantity: 1, amount: 1, method: "efectivo", paidOn: "2026-09-29" }),
    ).rejects.toThrow(DomainError);
  });

  it("E-09 · paquete de 3 clases: no se guarda e indica que el mínimo es 4", async () => {
    await expect(
      savePackage(ctxFor(db, ROOT), { name: "Mini", kind: "individual", classCount: 3, price: 1, isActive: true }),
    ).rejects.toThrow(/mínimo es de 4/);
  });
});

describe("Cierre de clases", () => {
  async function scenario(balance: number) {
    const prof = await makeUser(db, ["profesor"]);
    const caddie = await makeUser(db, ["caddie"]);
    const c = await makeUser(db, ["cliente"]);
    const s = (await studentIdOfProfile(db, c.id))!;
    await buyIndividual(c.id, s, balance);
    const cls = await createIndividualClass(ctxFor(db, prof), { courtId: 2, date: "2026-09-29", startMin: H(9), studentId: s });
    return { prof, caddie, s, cls };
  }

  it("E-10 · clase con caddie: bolsa 8 → 7; profesor y caddie suman 1 sesión", async () => {
    const { prof, caddie, s, cls } = await scenario(8);
    await assignCaddie(ctxFor(db, prof), cls.id, caddie.id);
    await closeClass(ctxFor(db, prof, at("2026-09-29T15:00:00Z")), cls.id, { outcome: "dictada" });
    expect((await balancesOf(db, s)).individual).toBe(7);
    const period = periodFor("2026-09-29", "quincenal");
    expect((await personSessions(db, prof.id, period)).total).toBe(1);
    expect((await personSessions(db, caddie.id, period)).total).toBe(1);
  });

  it("E-11 · clase sin caddie: bolsa 7 → 6; solo el profesor suma", async () => {
    const { prof, caddie, s, cls } = await scenario(7);
    await closeClass(ctxFor(db, prof), cls.id, { outcome: "dictada" });
    expect((await balancesOf(db, s)).individual).toBe(6);
    const period = periodFor("2026-09-29", "quincenal");
    expect((await personSessions(db, prof.id, period)).total).toBe(1);
    expect((await personSessions(db, caddie.id, period)).total).toBe(0);
  });

  it("E-12 · cancelada por lluvia: la bolsa sigue igual y nadie suma sesiones", async () => {
    const { prof, s, cls } = await scenario(6);
    const lluvia = (await listReasons(db)).find((r) => r.label === "Lluvia")!;
    await closeClass(ctxFor(db, prof), cls.id, { outcome: "cancelada", reasonId: lluvia.id });
    expect((await balancesOf(db, s)).individual).toBe(6);
    expect((await personSessions(db, prof.id, periodFor("2026-09-29", "quincenal"))).total).toBe(0);
    await expect(closeClass(ctxFor(db, prof), cls.id, { outcome: "cancelada" })).rejects.toThrow(/ya está cerrada/);
  });

  it("CA-33 · cancelar exige un motivo de la lista", async () => {
    const { prof, cls } = await scenario(4);
    await expect(closeClass(ctxFor(db, prof), cls.id, { outcome: "cancelada" })).rejects.toThrow(/motivo/);
  });

  it("E-13 · agendar no descuenta: 3 clases agendadas y la bolsa sigue en 5", async () => {
    const prof = await makeUser(db, ["profesor"]);
    const c = await makeUser(db, ["cliente"]);
    const s = (await studentIdOfProfile(db, c.id))!;
    await buyIndividual(c.id, s, 5);
    for (const d of ["2026-09-30", "2026-10-01", "2026-10-02"]) {
      await createIndividualClass(ctxFor(db, prof), { courtId: 1, date: d, startMin: H(7, 30), studentId: s });
    }
    expect((await balancesOf(db, s)).individual).toBe(5);
  });

  it("CA-34 · sin saldo igual se agenda y se cierra; la bolsa queda en negativo", async () => {
    const prof = await makeUser(db, ["profesor"]);
    const c = await makeUser(db, ["cliente"]);
    const s = (await studentIdOfProfile(db, c.id))!;
    const cls = await createIndividualClass(ctxFor(db, prof), { courtId: 1, date: "2026-09-29", startMin: H(6), studentId: s });
    await closeClass(ctxFor(db, prof), cls.id, { outcome: "dictada" });
    expect((await balancesOf(db, s)).individual).toBe(-1);
  });

  it("D-23 · no se cierra como dictada antes de la hora de inicio", async () => {
    const prof = await makeUser(db, ["profesor"]);
    const c = await makeUser(db, ["cliente"]);
    const cls = await createIndividualClass(ctxFor(db, prof), { courtId: 1, date: "2026-09-30", startMin: H(6), studentId: (await studentIdOfProfile(db, c.id))! });
    await expect(closeClass(ctxFor(db, prof), cls.id, { outcome: "dictada" })).rejects.toThrow(/desde su hora de inicio/);
  });

  it("E-14 · asistencia grupal: 8 presentes quedan en 3, 2 ausentes siguen en 4; profesor y caddie suman 1", async () => {
    const prof = await makeUser(db, ["profesor"]);
    const caddie = await makeUser(db, ["caddie"]);
    const papa = await makeUser(db, ["cliente"]);
    const pkg = await savePackage(ctxFor(db, ROOT), { name: "Grupal 4", kind: "grupal", classCount: 4, price: 120_000, isActive: true });
    const kids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const k = await makeChild(db, [papa.id]);
      kids.push(k);
      await registerClassPayment(ctxFor(db, ROOT), { payerId: papa.id, studentId: (await studentIdOfChild(db, k))!, packageId: pkg, amount: 120_000, method: "efectivo", paidOn: "2026-09-29" });
    }
    await createGroup(ctxFor(db, ROOT), {
      name: "Sub-10",
      code: "S10",
      profesorId: prof.id,
      startDate: "2026-09-28",
      days: [{ weekday: 2, startMin: H(14, 30), courtId: 2 }],
      childIds: kids,
    });
    const { bookings } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const [occ] = await db.select().from(bookings).where(and(eq(bookings.kind, "grupal"), eq(bookings.localDate, "2026-09-29")));
    expect(occ).toBeDefined();
    await closeClass(ctxFor(db, prof, at("2026-09-29T20:00:00Z")), occ.id, {
      outcome: "dictada",
      presentChildIds: kids.slice(0, 8),
      caddieId: caddie.id,
    });
    for (const [i, k] of kids.entries()) {
      expect((await balancesOf(db, (await studentIdOfChild(db, k))!)).grupal).toBe(i < 8 ? 3 : 4);
    }
    const period = periodFor("2026-09-29", "quincenal");
    expect((await personSessions(db, prof.id, period)).total).toBe(1);
    expect((await personSessions(db, caddie.id, period)).total).toBe(1);
  });
});

describe("Alquileres y liquidación", () => {
  it("E-16 · alquiler de 2 turnos nocturnos con caddie: valor = 2 × nocturno + 2 recargos; caddie suma 2", async () => {
    const c = await makeUser(db, ["cliente"]);
    const caddie = await makeUser(db, ["caddie"]);
    const r = await createRental(ctxFor(db, c, at("2026-09-28T15:00:00Z")), { courtId: 5, date: "2026-09-28", startMin: H(18, 30), turns: 2 });
    await closeRental(ctxFor(db, ROOT, at("2026-09-29T15:00:00Z")), r.id, { outcome: "usado", caddieId: caddie.id });
    expect((await rentalAccounts(db, [r.id])).get(r.id)!.value).toBe(2 * 60_000 + 2 * 15_000);
    expect((await personSessions(db, caddie.id, periodFor("2026-09-28", "quincenal"))).total).toBe(2);
  });

  it("E-17 · alquiler no usado: no se cobra y nadie suma", async () => {
    const c = await makeUser(db, ["cliente"]);
    const r = await createRental(ctxFor(db, c, at("2026-09-28T15:00:00Z")), { courtId: 5, date: "2026-09-28", startMin: H(18, 30), turns: 1 });
    await expect(closeRental(ctxFor(db, ROOT), r.id, { outcome: "no_usado" })).rejects.toThrow(/motivo/);
    const otro = (await listReasons(db)).find((x) => x.label === "Otro")!;
    await closeRental(ctxFor(db, ROOT), r.id, { outcome: "no_usado", reasonId: otro.id });
    expect((await rentalAccounts(db, [r.id])).get(r.id)!.value).toBe(0);
    expect((await getBooking(db, r.id)).status).toBe("no_usado");
  });

  it("E-18 · liquidación por sesión: 6 sesiones de 45 min + 6 de 60 min = 12 × valor por sesión", async () => {
    const prof = await makeUser(db, ["profesor"]);
    const caddie = await makeUser(db, ["caddie"]);
    await db.update(profiles).set({ caddieRate: 20_000 }).where(eq(profiles.id, caddie.id));
    const c = await makeUser(db, ["cliente"]);
    const s = (await studentIdOfProfile(db, c.id))!;
    const days = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28"];
    for (const d of days) {
      for (const start of [H(6), H(13, 30)]) {
        const cls = await createIndividualClass(ctxFor(db, prof), { courtId: 1, date: d, startMin: start, studentId: s });
        await assignCaddie(ctxFor(db, prof), cls.id, caddie.id);
        await closeClass(ctxFor(db, prof), cls.id, { outcome: "dictada" });
      }
    }
    const period = periodFor("2026-09-29", "quincenal");
    const line = (await payrollPreview(db, period)).find((l) => l.personId === caddie.id)!;
    expect(line.sessions).toBe(12);
    expect(line.entries).toHaveLength(12);
    expect(line.amount).toBe(12 * 20_000);
    const paid = await markPayrollPaid(ctxFor(db, ROOT), caddie.id, period);
    expect(paid.amount).toBe(240_000);
    expect((await payrollPreview(db, period)).find((l) => l.personId === caddie.id)).toBeUndefined();
  });
});
