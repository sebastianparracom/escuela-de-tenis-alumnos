/** Reglas y decisiones adicionales (CA-12, CA-18, CA-26, CA-37, D-20 a D-28, permisos). */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { bookings, profiles } from "@/db/schema";
import type { DB } from "@/db/types";
import { periodFor } from "@/lib/periods";
import { suggestEnds, validateBands } from "@/lib/schedule";
import {
  addGuest,
  assignCaddie,
  cancelRental,
  changeOccurrenceProfesor,
  closeClass,
  closeRental,
  correctClosure,
  createIndividualClass,
  createRental,
} from "@/server/bookings";
import { listReasons, saveSchedule, savePackage } from "@/server/config";
import { createGroup } from "@/server/groups";
import { studentIdOfChild, studentIdOfProfile } from "@/server/people";
import { balancesOf, registerClassPayment, registerRentalPayment, rentalAccounts, voidPayment } from "@/server/payments";
import { markPayrollPaid, payrollPreview, personSessions } from "@/server/payroll";
import { bookingView } from "@/server/queries";
import { BANDS, baseSetup, ctxFor, freshDb, makeChild, makeUser, ROOT } from "./helpers";

const H = (h: number, m = 0) => h * 60 + m;
const at = (iso: string) => new Date(iso);
let db: DB;

beforeEach(async () => {
  db = await freshDb();
  await baseSetup(db);
});

async function reasonId(label: string) {
  return (await listReasons(db)).find((r) => r.label === label)!.id;
}

describe("Franjas", () => {
  it("D-05 · franja inexacta: la rechaza y sugiere las horas de fin exactas", () => {
    const errs = validateBands([{ calendar: "entre_semana", startMin: H(6), endMin: H(14), turnMinutes: 45, isNight: false }]);
    expect(errs[0]).toMatch(/13:30 o 14:15/);
    expect(suggestEnds(H(6), H(14), 45)).toEqual([H(13, 30), H(14, 15)]);
  });

  it("D-06 · franjas que se solapan: las rechaza", () => {
    const errs = validateBands([
      { calendar: "entre_semana", startMin: H(6), endMin: H(9), turnMinutes: 60, isNight: false },
      { calendar: "entre_semana", startMin: H(8), endMin: H(10), turnMinutes: 60, isNight: false },
    ]);
    expect(errs.join(" ")).toMatch(/se solapan/);
  });

  it("D-39 · solo turnos de 45 o 60 minutos", () => {
    expect(validateBands([{ calendar: "entre_semana", startMin: H(6), endMin: H(8), turnMinutes: 30, isNight: false }])[0]).toMatch(/45 o 60/);
  });

  it("CA-12 · un grupo sin fecha de fin bloquea el cambio de su franja y el error lo nombra", async () => {
    const prof = await makeUser(db, ["profesor"]);
    await createGroup(ctxFor(db, ROOT), { name: "Sub-12", code: "S12", profesorId: prof.id, startDate: "2026-09-28", days: [{ weekday: 1, startMin: H(16, 30), courtId: 1 }], childIds: [] });
    const nuevo = BANDS.map((b) => (b.calendar === "entre_semana" && b.startMin === H(13, 30) ? { ...b, turnMinutes: 45, endMin: H(18, 0) } : b)).map((b) =>
      b.calendar === "entre_semana" && b.startMin === H(18, 30) ? { ...b, startMin: H(18, 0), endMin: H(21) } : b,
    );
    await expect(saveSchedule(ctxFor(db, ROOT), "2026-12-01", nuevo)).rejects.toThrow(/grupo Sub-12/);
  });

  it("D-20 · en festivo no hay clase de grupo", async () => {
    const prof = await makeUser(db, ["profesor"]);
    await createGroup(ctxFor(db, ROOT), { name: "Lunes", code: "L", profesorId: prof.id, startDate: "2026-10-05", endDate: "2026-10-19", days: [{ weekday: 1, startMin: H(15, 30), courtId: 1 }], childIds: [] });
    const rows = await db.select({ d: bookings.localDate }).from(bookings).where(eq(bookings.kind, "grupal"));
    expect(rows.map((r) => r.d).sort()).toEqual(["2026-10-05", "2026-10-19"]); // 12 oct es festivo
  });
});

describe("Alquileres", () => {
  it("CA-18 · el cliente cancela antes de la hora y el turno queda libre; otro cliente no puede", async () => {
    const c = await makeUser(db, ["cliente"]);
    const otro = await makeUser(db, ["cliente"]);
    const r = await createRental(ctxFor(db, c), { courtId: 1, date: "2026-10-01", startMin: H(13, 30), turns: 1 });
    await expect(cancelRental(ctxFor(db, otro), r.id)).rejects.toThrow(/No puedes/);
    await cancelRental(ctxFor(db, c), r.id);
    await expect(createRental(ctxFor(db, otro), { courtId: 1, date: "2026-10-01", startMin: H(13, 30), turns: 1 })).resolves.toBeTruthy();
  });

  it("CA-18 · no se cancela después de la hora", async () => {
    const c = await makeUser(db, ["cliente"]);
    const r = await createRental(ctxFor(db, c, at("2026-09-28T12:00:00Z")), { courtId: 1, date: "2026-09-28", startMin: H(13, 30), turns: 1 });
    await expect(cancelRental(ctxFor(db, c), r.id)).rejects.toThrow(/antes de la hora/);
  });

  it("D-09 y D-08 · límites del cliente: turnos seguidos y anticipación", async () => {
    const c = await makeUser(db, ["cliente"]);
    await expect(createRental(ctxFor(db, c), { courtId: 1, date: "2026-10-01", startMin: H(6), turns: 4 })).rejects.toThrow(/hasta 3 turnos/);
    await expect(createRental(ctxFor(db, c), { courtId: 1, date: "2026-10-30", startMin: H(8), turns: 1 })).rejects.toThrow(/14 días/);
  });

  it("D-28 · pago antes de cerrar; con caddie el recargo queda aparte; un pago cubre varios alquileres", async () => {
    const c = await makeUser(db, ["cliente"]);
    const caddie = await makeUser(db, ["caddie"]);
    const past = ctxFor(db, c, at("2026-09-27T12:00:00Z"));
    const r1 = await createRental(past, { courtId: 1, date: "2026-09-28", startMin: H(18, 30), turns: 2 });
    const r2 = await createRental(past, { courtId: 2, date: "2026-09-28", startMin: H(13, 30), turns: 1 });
    await registerRentalPayment(ctxFor(db, ROOT), { payerId: c.id, bookingIds: [r1.id, r2.id], method: "efectivo", paidOn: "2026-09-28" });
    let acc = await rentalAccounts(db, [r1.id, r2.id]);
    expect(acc.get(r1.id)).toMatchObject({ value: 120_000, paid: 120_000, outstanding: 0 });
    expect(acc.get(r2.id)).toMatchObject({ value: 50_000, outstanding: 0 });
    await closeRental(ctxFor(db, ROOT), r1.id, { outcome: "usado", caddieId: caddie.id });
    acc = await rentalAccounts(db, [r1.id]);
    expect(acc.get(r1.id)!.outstanding).toBe(30_000);
    await expect(registerRentalPayment(ctxFor(db, ROOT), { payerId: c.id, bookingIds: [r2.id], method: "efectivo", paidOn: "2026-09-29" })).rejects.toThrow(/saldo pendiente/);
    const p = await registerRentalPayment(ctxFor(db, ROOT), { payerId: c.id, bookingIds: [r1.id], method: "transferencia", paidOn: "2026-09-29" });
    expect(p.amount).toBe(30_000);
  });

  it("D-28 · alquiler pagado y luego no usado: queda con saldo a favor hasta anular el pago", async () => {
    const c = await makeUser(db, ["cliente"]);
    const r = await createRental(ctxFor(db, c, at("2026-09-27T12:00:00Z")), { courtId: 1, date: "2026-09-28", startMin: H(13, 30), turns: 1 });
    const p = await registerRentalPayment(ctxFor(db, ROOT), { payerId: c.id, bookingIds: [r.id], method: "efectivo", paidOn: "2026-09-28" });
    await closeRental(ctxFor(db, ROOT), r.id, { outcome: "no_usado", reasonId: await reasonId("Otro") });
    expect((await rentalAccounts(db, [r.id])).get(r.id)!.outstanding).toBe(-50_000);
    await voidPayment(ctxFor(db, ROOT), p.id, "El cliente no vino; se devolvió el dinero");
    expect((await rentalAccounts(db, [r.id])).get(r.id)!.outstanding).toBe(0);
  });
});

describe("Pagos", () => {
  it("CA-26 · anular un pago revierte su efecto en la bolsa", async () => {
    const c = await makeUser(db, ["cliente"]);
    const s = (await studentIdOfProfile(db, c.id))!;
    const p = await registerClassPayment(ctxFor(db, ROOT), { payerId: c.id, studentId: s, looseType: "individual_nocturna", quantity: 2, amount: 160_000, method: "efectivo", paidOn: "2026-09-29" });
    expect((await balancesOf(db, s)).individual).toBe(2);
    await expect(voidPayment(ctxFor(db, ROOT), p.id, "  ")).rejects.toThrow(/motivo/);
    await voidPayment(ctxFor(db, ROOT), p.id, "Registrado dos veces");
    expect((await balancesOf(db, s)).individual).toBe(0);
    await expect(voidPayment(ctxFor(db, ROOT), p.id, "otra vez")).rejects.toThrow(/ya está anulado/);
  });

  it("CA-23 · el alumno debe ser el cliente o un niño a su cargo", async () => {
    const a = await makeUser(db, ["cliente"]);
    const b = await makeUser(db, ["cliente"]);
    const hijoB = await makeChild(db, [b.id]);
    await expect(
      registerClassPayment(ctxFor(db, ROOT), { payerId: a.id, studentId: (await studentIdOfChild(db, hijoB))!, looseType: "grupal", quantity: 1, amount: 1, method: "efectivo", paidOn: "2026-09-29" }),
    ).rejects.toThrow(/niño a su cargo/);
  });

  it("CA-21 · desactivar un paquete no afecta a quien ya lo compró", async () => {
    const c = await makeUser(db, ["cliente"]);
    const s = (await studentIdOfProfile(db, c.id))!;
    const pkg = await savePackage(ctxFor(db, ROOT), { name: "P5", kind: "individual", classCount: 5, price: 1, isActive: true });
    await registerClassPayment(ctxFor(db, ROOT), { payerId: c.id, studentId: s, packageId: pkg, amount: 1, method: "efectivo", paidOn: "2026-09-29" });
    await savePackage(ctxFor(db, ROOT), { id: pkg, name: "P5", kind: "individual", classCount: 10, price: 1, isActive: false });
    expect((await balancesOf(db, s)).individual).toBe(5);
  });
});

describe("Cierres, caddie y correcciones", () => {
  async function dictated(date = "2026-09-29") {
    const prof = await makeUser(db, ["profesor"]);
    const caddie = await makeUser(db, ["caddie"]);
    const c = await makeUser(db, ["cliente"]);
    const s = (await studentIdOfProfile(db, c.id))!;
    const cls = await createIndividualClass(ctxFor(db, prof), { courtId: 1, date, startMin: H(6), studentId: s });
    await closeClass(ctxFor(db, prof), cls.id, { outcome: "dictada" });
    return { prof, caddie, s, cls };
  }

  it("D-25 · el profesor agrega el caddie después del cierre hasta 15 días; cambiarlo es corrección", async () => {
    const { prof, caddie, cls } = await dictated("2026-09-21");
    const otro = await makeUser(db, ["caddie"]);
    await assignCaddie(ctxFor(db, prof, at("2026-10-06T15:00:00Z")), cls.id, caddie.id); // 15 días después
    expect((await personSessions(db, caddie.id, periodFor("2026-09-21", "quincenal"))).total).toBe(1);
    await expect(assignCaddie(ctxFor(db, prof, at("2026-10-06T15:00:00Z")), cls.id, otro.id)).rejects.toThrow(/corregir el cierre/);
  });

  it("D-25 · pasados 15 días el profesor ya no puede; el administrador sí", async () => {
    const { prof, caddie, cls } = await dictated("2026-09-10");
    await expect(assignCaddie(ctxFor(db, prof), cls.id, caddie.id)).rejects.toThrow(/15 días/);
    await assignCaddie(ctxFor(db, ROOT), cls.id, caddie.id);
    expect((await personSessions(db, caddie.id, periodFor("2026-09-10", "quincenal"))).total).toBe(1);
  });

  it("CA-37 · corregir de dictada a cancelada devuelve la clase y quita las sesiones, con motivo y autor", async () => {
    const { prof, s, cls } = await dictated();
    expect((await balancesOf(db, s)).individual).toBe(-1);
    await expect(correctClosure(ctxFor(db, prof), cls.id, { status: "cancelada", caddieId: null, reasonId: 1 }, "x")).rejects.toThrow(/administrador/);
    await expect(correctClosure(ctxFor(db, ROOT), cls.id, { status: "cancelada", caddieId: null, reasonId: 1 }, "")).rejects.toThrow(/motivo/);
    await correctClosure(ctxFor(db, ROOT), cls.id, { status: "cancelada", caddieId: null, reasonId: await reasonId("Lluvia") }, "Se registró mal");
    expect((await balancesOf(db, s)).individual).toBe(0);
    expect((await personSessions(db, prof.id, periodFor("2026-09-29", "quincenal"))).total).toBe(0);
    await correctClosure(ctxFor(db, ROOT), cls.id, { status: "dictada", caddieId: null }, "Sí se dictó");
    expect((await balancesOf(db, s)).individual).toBe(-1);
  });

  it("D-26 · lo agregado después de pagar una liquidación va como ajuste en la siguiente", async () => {
    const { caddie, cls } = await dictated("2026-09-10");
    await db.update(profiles).set({ caddieRate: 10_000 }).where(eq(profiles.id, caddie.id));
    const first = periodFor("2026-09-10", "quincenal");
    // El caddie trabajó otra clase en el período y se liquida.
    const other = await dictated("2026-09-11");
    await assignCaddie(ctxFor(db, ROOT), other.cls.id, caddie.id);
    await markPayrollPaid(ctxFor(db, ROOT), caddie.id, first);
    // Luego se agrega el caddie olvidado a una clase de ese período ya pagado.
    await assignCaddie(ctxFor(db, ROOT), cls.id, caddie.id);
    const next = periodFor("2026-09-20", "quincenal");
    const line = (await payrollPreview(db, next)).find((l) => l.personId === caddie.id)!;
    expect(line).toMatchObject({ sessions: 1, amount: 10_000 });
    expect(line.parts).toEqual([expect.objectContaining({ role: "caddie", sessions: 1, adjustments: 1, inPeriod: 0, amount: 10_000 })]);
  });

  it("Permisos · un profesor no cierra la clase de otro", async () => {
    const p1 = await makeUser(db, ["profesor"]);
    const p2 = await makeUser(db, ["profesor"]);
    const c = await makeUser(db, ["cliente"]);
    const cls = await createIndividualClass(ctxFor(db, p1), { courtId: 1, date: "2026-09-29", startMin: H(6), studentId: (await studentIdOfProfile(db, c.id))! });
    await expect(closeClass(ctxFor(db, p2), cls.id, { outcome: "dictada" })).rejects.toThrow(/Solo el profesor/);
  });

  it("CA-06 · un cliente no ve la reserva de otro cliente", async () => {
    const a = await makeUser(db, ["cliente"]);
    const b = await makeUser(db, ["cliente"]);
    const r = await createRental(ctxFor(db, a), { courtId: 1, date: "2026-10-01", startMin: H(13, 30), turns: 1 });
    await expect(bookingView(db, r.id, b)).rejects.toThrow(/No tienes acceso/);
    const v = await bookingView(db, r.id, a);
    expect(v.can.cancelRental).toBe(true);
  });

  it("D-11 · el profesor ve el alquiler pero no el nombre del cliente", async () => {
    const c = await makeUser(db, ["cliente"], "Cliente Secreto");
    const prof = await makeUser(db, ["profesor"]);
    const r = await createRental(ctxFor(db, c), { courtId: 1, date: "2026-10-01", startMin: H(13, 30), turns: 1 });
    await expect(bookingView(db, r.id, prof)).rejects.toThrow(/No tienes acceso/);
    const admin = await bookingView(db, r.id, ROOT);
    expect(admin.client).toBe("Cliente Secreto");
  });
});

describe("Grupos", () => {
  it("D-21 y D-22 · invitado presente descuenta de su bolsa grupal; la sesión va al suplente", async () => {
    const prof = await makeUser(db, ["profesor"]);
    const suplente = await makeUser(db, ["profesor"]);
    const papa = await makeUser(db, ["cliente"]);
    const inscrito = await makeChild(db, [papa.id]);
    const invitado = await makeChild(db, [papa.id]);
    await createGroup(ctxFor(db, ROOT), { name: "G", code: "G", profesorId: prof.id, startDate: "2026-09-28", days: [{ weekday: 2, startMin: H(13, 30), courtId: 3 }], childIds: [inscrito] });
    const [occ] = await db.select().from(bookings).where(and(eq(bookings.kind, "grupal"), eq(bookings.localDate, "2026-09-29")));
    await addGuest(ctxFor(db, prof), occ.id, invitado);
    await changeOccurrenceProfesor(ctxFor(db, ROOT), occ.id, suplente.id);
    await expect(closeClass(ctxFor(db, prof, at("2026-09-29T19:00:00Z")), occ.id, { outcome: "dictada", presentChildIds: [inscrito, invitado] })).rejects.toThrow(/Solo el profesor/);
    await closeClass(ctxFor(db, suplente, at("2026-09-29T19:00:00Z")), occ.id, { outcome: "dictada", presentChildIds: [inscrito, invitado] });
    expect((await balancesOf(db, (await studentIdOfChild(db, invitado))!)).grupal).toBe(-1);
    const period = periodFor("2026-09-29", "quincenal");
    expect((await personSessions(db, suplente.id, period)).total).toBe(1);
    expect((await personSessions(db, prof.id, period)).total).toBe(0);
  });

  it("CA-17 · el horario del grupo no puede cruzarse con otra reserva", async () => {
    const prof = await makeUser(db, ["profesor"]);
    const c = await makeUser(db, ["cliente"]);
    await createRental(ctxFor(db, c), { courtId: 3, date: "2026-10-06", startMin: H(13, 30), turns: 1 });
    await expect(
      createGroup(ctxFor(db, ROOT), { name: "G", code: "G", profesorId: prof.id, startDate: "2026-09-28", days: [{ weekday: 2, startMin: H(13, 30), courtId: 3 }], childIds: [] }),
    ).rejects.toThrow(/se cruza/);
  });
});

describe("Profesor y caddie a la vez (D-43, D-44)", () => {
  async function dual() {
    const both = await makeUser(db, ["profesor", "caddie"], "Camilo Ruiz");
    await db.update(profiles).set({ profesorRate: 30_000, caddieRate: 20_000 }).where(eq(profiles.id, both.id));
    return both;
  }

  it("D-44 · no puede ser profesor en una clase y caddie en otra a la misma hora", async () => {
    const both = await dual();
    const otro = await makeUser(db, ["profesor"]);
    const c1 = await makeUser(db, ["cliente"]);
    const c2 = await makeUser(db, ["cliente"]);
    const suya = await createIndividualClass(ctxFor(db, both), { courtId: 1, date: "2026-10-01", startMin: H(9), studentId: (await studentIdOfProfile(db, c1.id))! });
    const ajena = await createIndividualClass(ctxFor(db, otro), { courtId: 2, date: "2026-10-01", startMin: H(9), studentId: (await studentIdOfProfile(db, c2.id))! });
    await expect(assignCaddie(ctxFor(db, otro), ajena.id, both.id)).rejects.toThrow(/está dando otra clase/);
    // Al revés: primero de caddie, luego no puede agendar su clase a esa hora.
    await closeClass(ctxFor(db, both), suya.id, { outcome: "cancelada", reasonId: await reasonId("Otro") });
    await assignCaddie(ctxFor(db, otro), ajena.id, both.id);
    await expect(
      createIndividualClass(ctxFor(db, both), { courtId: 3, date: "2026-10-01", startMin: H(9), studentId: (await studentIdOfProfile(db, c1.id))! }),
    ).rejects.toThrow(/como caddie en otra reserva/);
  });

  it("D-44 · el profesor no puede ser caddie de su propia clase (también lo impide la base de datos)", async () => {
    const both = await dual();
    const c = await makeUser(db, ["cliente"]);
    const cls = await createIndividualClass(ctxFor(db, both), { courtId: 1, date: "2026-10-01", startMin: H(9), studentId: (await studentIdOfProfile(db, c.id))! });
    await expect(assignCaddie(ctxFor(db, both), cls.id, both.id)).rejects.toThrow(/su propia clase/);
    await expect(db.update(bookings).set({ caddieId: both.id }).where(eq(bookings.id, cls.id))).rejects.toThrow();
  });

  it("D-43 y D-45 · la liquidación aplica el valor de cada rol en una sola tarjeta y un solo pago", async () => {
    const both = await dual();
    const otro = await makeUser(db, ["profesor"]);
    const c = await makeUser(db, ["cliente"]);
    const s = (await studentIdOfProfile(db, c.id))!;
    // 2 clases como profesor
    for (const start of [H(6), H(6, 45)]) {
      const cls = await createIndividualClass(ctxFor(db, both), { courtId: 1, date: "2026-09-21", startMin: start, studentId: s });
      await closeClass(ctxFor(db, both), cls.id, { outcome: "dictada" });
    }
    // 3 como caddie en clases de otro profesor
    for (const start of [H(7, 30), H(8, 15), H(9)]) {
      const cls = await createIndividualClass(ctxFor(db, otro), { courtId: 2, date: "2026-09-21", startMin: start, studentId: s });
      await closeClass(ctxFor(db, otro), cls.id, { outcome: "dictada", caddieId: both.id });
    }
    const period = periodFor("2026-09-21", "quincenal");
    const line = (await payrollPreview(db, period)).find((l) => l.personId === both.id)!;
    expect(line.parts).toEqual([
      expect.objectContaining({ role: "profesor", sessions: 2, rate: 30_000, amount: 60_000 }),
      expect.objectContaining({ role: "caddie", sessions: 3, rate: 20_000, amount: 60_000 }),
    ]);
    expect(line.amount).toBe(120_000);
    const paid = await markPayrollPaid(ctxFor(db, ROOT), both.id, period);
    expect(paid.items).toHaveLength(2);
    expect(paid.amount).toBe(120_000);
    expect((await payrollPreview(db, period)).find((l) => l.personId === both.id)).toBeUndefined();
  });

  it("D-45 · sin el valor de uno de sus roles no se puede liquidar", async () => {
    const both = await makeUser(db, ["profesor", "caddie"]);
    await db.update(profiles).set({ profesorRate: 30_000 }).where(eq(profiles.id, both.id));
    const otro = await makeUser(db, ["profesor"]);
    const c = await makeUser(db, ["cliente"]);
    const cls = await createIndividualClass(ctxFor(db, otro), { courtId: 2, date: "2026-09-21", startMin: H(9), studentId: (await studentIdOfProfile(db, c.id))! });
    await closeClass(ctxFor(db, otro), cls.id, { outcome: "dictada", caddieId: both.id });
    await expect(markPayrollPaid(ctxFor(db, ROOT), both.id, periodFor("2026-09-21", "quincenal"))).rejects.toThrow(/como caddie/);
  });
});
