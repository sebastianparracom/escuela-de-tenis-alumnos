import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, FormCard, Group, Input, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { fullDate } from "@/lib/format";
import { turnsOf } from "@/lib/schedule";
import { hhmm, localDate } from "@/lib/time";
import { loadSchedules, scheduleAt } from "@/server/config";
import { ctxOf, requireUser } from "@/server/session";
import { scheduleAction } from "../actions";
import { BandsEditor } from "./bands-editor";

export const metadata = { title: "Franjas" };

export default async function FranjasPage() {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const today = localDate(ctx.now);
  const versions = await loadSchedules(ctx.db);
  const current = scheduleAt(versions, today);
  const pending = versions.filter((v) => v.effectiveFrom > today);
  const base = pending.at(-1) ?? current;
  return (
    <>
      <PageHeader back={{ href: "/configuracion", label: "Configuración" }} title="Franjas" />
      <p className="px-4 text-sm text-muted">Las franjas aplican igual a todas las canchas. Turnos de 45 o 60 minutos, pegados.</p>
      {current ? (
        <>
          <SectionTitle>Vigentes desde {fullDate(current.effectiveFrom)}</SectionTitle>
          <Group>
            {(["entre_semana", "fin_de_semana"] as const).map((cal) => (
              <div key={cal} className="px-3.5 py-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[15px] font-semibold">{cal === "entre_semana" ? "Entre semana" : "Fin de semana y festivos"}</span>
                  <span className="font-mono text-sm">{turnsOf(current.bands, cal).length} turnos</span>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-muted">
                  {current.bands.filter((b) => b.calendar === cal).map((b) => (
                    <li key={b.startMin} className="font-mono">
                      {hhmm(b.startMin)}–{hhmm(b.endMin)} · {b.turnMinutes} min · {b.isNight ? "nocturna" : "diurna"}
                    </li>
                  ))}
                  {current.bands.every((b) => b.calendar !== cal) && <li>Sin franjas</li>}
                </ul>
              </div>
            ))}
          </Group>
        </>
      ) : (
        <div className="mt-3"><Notice tone="red">Todavía no hay franjas: nadie puede reservar hasta configurarlas.</Notice></div>
      )}
      {pending.map((v) => (
        <div key={v.id} className="mt-3">
          <Notice>Hay un cambio programado desde el {fullDate(v.effectiveFrom)}.</Notice>
        </div>
      ))}
      <SectionTitle>{current ? "Programar un cambio" : "Configurar franjas"}</SectionTitle>
      <FormCard>
        <ActionForm action={scheduleAction}>
          <BandsEditor initial={base?.bands ?? []} />
          <Field label="Rige desde" hint="No se acepta la fecha si ya hay reservas dentro de las franjas que cambian (CA-12).">
            <Input type="date" name="effectiveFrom" defaultValue={today} min={today} required />
          </Field>
          <SubmitButton>Guardar franjas</SubmitButton>
        </ActionForm>
      </FormCard>
    </>
  );
}
