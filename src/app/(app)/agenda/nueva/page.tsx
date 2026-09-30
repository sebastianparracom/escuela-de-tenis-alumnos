import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { SearchPicker } from "@/components/picker";
import { Field, FormCard, Notice, PageHeader, Select } from "@/components/ui";
import { longDate } from "@/lib/format";
import { consecutiveTurns } from "@/lib/schedule";
import { hhmm, isValidDate } from "@/lib/time";
import { getSettings, listCourts, turnsForDate } from "@/server/config";
import { activeStudents, usersWithRole } from "@/server/people";
import { ctxOf, requireUser } from "@/server/session";
import { newBooking } from "../actions";
import { KindSwitch } from "./kind-switch";

export const metadata = { title: "Agendar" };

export default async function NuevaReservaPage({ searchParams }: PageProps<"/agenda/nueva">) {
  const user = await requireUser(["admin", "profesor"]);
  const ctx = await ctxOf(user);
  const sp = await searchParams;
  const courtId = Number(sp.cancha);
  const date = String(sp.fecha ?? "");
  const startMin = Number(sp.turno);
  if (!isValidDate(date) || !Number.isInteger(courtId) || !Number.isInteger(startMin)) notFound();
  const [courts, { turns }] = await Promise.all([listCourts(ctx.db, true), turnsForDate(ctx.db, date)]);
  const court = courts.find((c) => c.id === courtId);
  const turn = turns.find((t) => t.startMin === startMin);
  if (!court || !turn) {
    return (
      <>
        <PageHeader back={{ href: `/tablero?fecha=${date}`, label: "Tablero" }} title="Agendar" />
        <div className="mt-3">
          <Notice tone="red">Ese turno no existe en las franjas de ese día o la cancha está inactiva.</Notice>
        </div>
      </>
    );
  }
  const admin = user.roles.includes("admin");
  const students = await activeStudents(ctx.db);
  const options = students.map((s) => ({ value: s.studentId, label: s.name, hint: s.kind === "nino" ? "Niño a cargo" : "Cliente" }));
  const profesores = admin ? await usersWithRole(ctx.db, "profesor") : [];
  const clients = admin ? await usersWithRole(ctx.db, "cliente") : [];
  const settings = await getSettings(ctx.db);
  const maxTurns = Array.from({ length: 6 }, (_, i) => i + 1).filter((n) => consecutiveTurns(turns, startMin, n));

  const classFields = (
    <>
      {admin && (
        <Field label="Profesor">
          <Select name="profesorId" required defaultValue={user.roles.includes("profesor") ? user.id : ""}>
            <option value="" disabled>
              Escoge el profesor
            </option>
            {profesores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Alumno" hint="Clientes y niños activos. El caddie se asigna en la cancha.">
        <SearchPicker name="studentId" options={options} />
      </Field>
    </>
  );

  return (
    <>
      <PageHeader back={{ href: `/tablero?fecha=${date}`, label: "Tablero" }} title={admin ? "Nueva reserva" : "Agendar clase"} />
      <div className="mx-4 mt-2 mb-4 rounded-[14px] border border-line bg-surface px-4 py-3">
        <div className="text-[15px] font-semibold">
          {court.name} · {longDate(date)}
        </div>
        <div className="font-mono text-[13px] text-muted">
          {hhmm(turn.startMin)} – {hhmm(turn.endMin)} · {turn.isNight ? "nocturna" : "diurna"}
        </div>
      </div>
      {!admin ? (
        <FormCard>
          <ActionForm action={newBooking}>
            <input type="hidden" name="kind" value="individual" />
            <input type="hidden" name="courtId" value={courtId} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="startMin" value={startMin} />
            {classFields}
            <SubmitButton>Agendar clase</SubmitButton>
          </ActionForm>
        </FormCard>
      ) : (
        <KindSwitch
          classForm={
            <FormCard>
              <ActionForm action={newBooking}>
                <input type="hidden" name="kind" value="individual" />
                <input type="hidden" name="courtId" value={courtId} />
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="startMin" value={startMin} />
                {classFields}
                <SubmitButton>Agendar clase individual</SubmitButton>
              </ActionForm>
            </FormCard>
          }
          rentalForm={
            <FormCard>
              <ActionForm action={newBooking}>
                <input type="hidden" name="kind" value="alquiler" />
                <input type="hidden" name="courtId" value={courtId} />
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="startMin" value={startMin} />
                <Field label="Cliente">
                  <SearchPicker name="clientId" options={clients.map((c) => ({ value: c.id, label: c.fullName }))} />
                </Field>
                <Field label="Turnos seguidos" hint={`Los clientes pueden reservar hasta ${settings.clientMaxTurns} desde la app.`}>
                  <Select name="turns" defaultValue="1">
                    {maxTurns.map((n) => {
                      const tt = consecutiveTurns(turns, startMin, n)!;
                      return (
                        <option key={n} value={n}>
                          {n} {n === 1 ? "turno" : "turnos"} · hasta {hhmm(tt[tt.length - 1].endMin)}
                        </option>
                      );
                    })}
                  </Select>
                </Field>
                <SubmitButton>Reservar cancha</SubmitButton>
              </ActionForm>
            </FormCard>
          }
        />
      )}
      {admin && (
        <div className="mt-4">
          <Notice>El alquiler queda confirmado sin pago previo y no descuenta de ninguna bolsa.</Notice>
        </div>
      )}
    </>
  );
}
