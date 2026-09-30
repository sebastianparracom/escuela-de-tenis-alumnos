import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, FormCard, Group, Input, Notice, PageHeader, Row, SectionTitle } from "@/components/ui";
import { fullDate, money } from "@/lib/format";
import { localDate } from "@/lib/time";
import { listPriceLists } from "@/server/config";
import { ctxOf, requireUser } from "@/server/session";
import { pricesAction } from "../actions";

export const metadata = { title: "Tarifas" };

const FIELDS = [
  ["individualDay", "Clase individual suelta diurna"],
  ["individualNight", "Clase individual suelta nocturna"],
  ["groupSingle", "Clase grupal suelta"],
  ["rentalDay", "Alquiler por turno diurno"],
  ["rentalNight", "Alquiler por turno nocturno"],
  ["caddieSurcharge", "Recargo por caddie en alquiler, por turno"],
] as const;

export default async function TarifasPage() {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const lists = await listPriceLists(ctx.db);
  const today = localDate(ctx.now);
  const current = lists.find((l) => l.effectiveFrom <= today) ?? null;
  return (
    <>
      <PageHeader back={{ href: "/configuracion", label: "Configuración" }} title="Tarifas" />
      <p className="px-4 text-sm text-muted">Lo diurno o nocturno lo define la franja del turno. Cada alquiler se cobra con la tarifa vigente en su fecha.</p>
      {current ? (
        <>
          <SectionTitle>Vigentes desde {fullDate(current.effectiveFrom)}</SectionTitle>
          <Group>
            {FIELDS.map(([k, l]) => <Row key={k} title={l} trailing={<span className="font-mono font-semibold">{money(current[k])}</span>} />)}
          </Group>
        </>
      ) : (
        <div className="mt-3"><Notice tone="red">Todavía no hay tarifas. Defínelas para poder calcular alquileres.</Notice></div>
      )}
      <SectionTitle>{current ? "Cambiar tarifas" : "Definir tarifas"}</SectionTitle>
      <FormCard>
        <ActionForm action={pricesAction}>
          {FIELDS.map(([k, l]) => (
            <Field key={k} label={`${l} (COP)`}>
              <Input name={k} inputMode="numeric" defaultValue={current?.[k] ?? ""} required />
            </Field>
          ))}
          <Field label="Vigentes desde">
            <Input type="date" name="effectiveFrom" defaultValue={today} required />
          </Field>
          <SubmitButton size="md">Guardar tarifas</SubmitButton>
        </ActionForm>
      </FormCard>
      {lists.length > 1 && (
        <>
          <SectionTitle>Historial</SectionTitle>
          <Group>
            {lists.map((l) => <Row key={l.id} title={`Desde ${fullDate(l.effectiveFrom)}`} subtitle={`Individual ${money(l.individualDay)} / ${money(l.individualNight)} · Alquiler ${money(l.rentalDay)} / ${money(l.rentalNight)}`} />)}
          </Group>
        </>
      )}
    </>
  );
}
