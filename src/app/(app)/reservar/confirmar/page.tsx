import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, FormCard, Notice, PageHeader, Select } from "@/components/ui";
import { longDate, money } from "@/lib/format";
import { rentalValue } from "@/lib/pricing";
import { consecutiveTurns } from "@/lib/schedule";
import { hhmm, isValidDate } from "@/lib/time";
import { getSettings, listCourts, priceForOrNull } from "@/server/config";
import { agendaDay } from "@/server/queries";
import { ctxOf, requireUser } from "@/server/session";
import { newBooking } from "../../agenda/actions";

export const metadata = { title: "Confirmar reserva" };

export default async function ConfirmarPage({ searchParams }: PageProps<"/reservar/confirmar">) {
  const user = await requireUser(["cliente"]);
  const ctx = await ctxOf(user);
  const sp = await searchParams;
  const courtId = Number(sp.cancha);
  const date = String(sp.fecha ?? "");
  const startMin = Number(sp.turno);
  if (!isValidDate(date) || !Number.isInteger(courtId) || !Number.isInteger(startMin)) notFound();
  const [courts, settings, day, prices] = await Promise.all([
    listCourts(ctx.db, true),
    getSettings(ctx.db),
    agendaDay(ctx.db, date, { id: user.id, roles: ["cliente"] }),
    priceForOrNull(ctx.db, date),
  ]);
  const court = courts.find((c) => c.id === courtId);
  const ci = day.courts.findIndex((c) => c.id === courtId);
  const ti = day.turns.findIndex((t) => t.startMin === startMin);
  if (!court || ci < 0 || ti < 0) notFound();
  // Opciones: turnos seguidos, pegados y libres desde el escogido.
  const options: { n: number; end: number; value: number | null }[] = [];
  for (let n = 1; n <= settings.clientMaxTurns; n++) {
    const tt = consecutiveTurns(day.turns, startMin, n);
    if (!tt) break;
    if (day.cells[ti + n - 1][ci].state !== "libre") break;
    const night = tt.filter((t) => t.isNight).length;
    options.push({ n, end: tt[tt.length - 1].endMin, value: prices ? rentalValue({ status: "agendada", turns: n, nightTurns: night, caddieId: null }, prices) : null });
  }
  return (
    <>
      <PageHeader back={{ href: `/reservar?fecha=${date}`, label: "Reservar" }} title="Confirmar reserva" />
      <div className="mx-4 mt-2 mb-4 rounded-[14px] border border-line bg-surface px-4 py-3">
        <div className="text-[15px] font-semibold">
          {court.name} · {longDate(date)}
        </div>
        <div className="font-mono text-[13px] text-muted">Desde las {hhmm(startMin)}</div>
      </div>
      {options.length === 0 ? (
        <Notice tone="red">Ese turno ya no está disponible.</Notice>
      ) : (
        <FormCard>
          <ActionForm action={newBooking}>
            <input type="hidden" name="kind" value="alquiler" />
            <input type="hidden" name="courtId" value={courtId} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="startMin" value={startMin} />
            <Field label="¿Cuántos turnos seguidos?">
              <Select name="turns" defaultValue="1">
                {options.map((o) => (
                  <option key={o.n} value={o.n}>
                    {o.n} {o.n === 1 ? "turno" : "turnos"} · hasta {hhmm(o.end)}
                    {o.value !== null ? ` · ${money(o.value)}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs text-muted">Se paga en la escuela. Si juegas con caddie, se suma un recargo por turno. Puedes cancelar sin costo hasta la hora de inicio.</p>
            <SubmitButton>Confirmar reserva</SubmitButton>
          </ActionForm>
        </FormCard>
      )}
    </>
  );
}
