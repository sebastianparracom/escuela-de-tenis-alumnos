import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Field, FormCard, Group, Input, PageHeader, Row, SectionTitle, Select } from "@/components/ui";
import { getHolidaysByYear } from "colombian-holidays/getHolidaysByYear";
import { longDate } from "@/lib/format";
import { localDate } from "@/lib/time";
import { loadHolidayOverrides } from "@/server/config";
import { ctxOf, requireUser } from "@/server/session";
import { holidayAction } from "../actions";

export const metadata = { title: "Festivos" };

export default async function FestivosPage({ searchParams }: PageProps<"/configuracion/festivos">) {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const sp = await searchParams;
  const today = localDate(ctx.now);
  const year = Number(sp.anio) || Number(today.slice(0, 4));
  const overrides = await loadHolidayOverrides(ctx.db);
  const official = getHolidaysByYear(year);
  const extra = [...overrides].filter(([d, v]) => v && d.startsWith(String(year)) && !official.some((o) => o.celebrationDate === d));
  return (
    <>
      <PageHeader back={{ href: "/configuracion", label: "Configuración" }} title={`Festivos ${year}`} />
      <p className="px-4 text-sm text-muted">Los festivos usan las franjas de fin de semana y no tienen clases de grupo.</p>
      <div className="mx-4 mt-3 flex gap-2">
        <Link href={`/configuracion/festivos?anio=${year - 1}`} className="flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm">{year - 1}</Link>
        <Link href={`/configuracion/festivos?anio=${year + 1}`} className="flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm">{year + 1}</Link>
      </div>
      <SectionTitle>Calendario</SectionTitle>
      <Group>
        {official.map((h) => {
          const o = overrides.get(h.celebrationDate);
          return <Row key={h.celebrationDate} title={longDate(h.celebrationDate)} subtitle={h.name} trailing={o === false ? <Badge tone="red">No festivo</Badge> : <Badge tone="blue">Festivo</Badge>} />;
        })}
        {extra.map(([d]) => <Row key={d} title={longDate(d)} subtitle="Agregado por la administración" trailing={<Badge tone="blue">Festivo</Badge>} />)}
      </Group>
      <SectionTitle>Ajustar un día</SectionTitle>
      <FormCard>
        <ActionForm action={holidayAction}>
          <Field label="Fecha">
            <Input type="date" name="date" required />
          </Field>
          <Field label="Ese día">
            <Select name="value" defaultValue="si">
              <option value="si">Es festivo</option>
              <option value="no">No es festivo</option>
              <option value="oficial">Volver al calendario oficial</option>
            </Select>
          </Field>
          <SubmitButton size="md">Guardar</SubmitButton>
        </ActionForm>
      </FormCard>
    </>
  );
}
