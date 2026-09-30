import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, FormCard, Input, PageHeader, SectionTitle, Select } from "@/components/ui";
import { getBranding } from "@/server/branding";
import { getSettings } from "@/server/config";
import { ctxOf, requireUser } from "@/server/session";
import { paramsAction, schoolAction } from "../actions";

export const metadata = { title: "Escuela" };

export default async function EscuelaPage() {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const [s, brand] = await Promise.all([getSettings(ctx.db), getBranding()]);
  return (
    <>
      <PageHeader back={{ href: "/configuracion", label: "Configuración" }} title="Escuela" />
      <SectionTitle>Identidad</SectionTitle>
      <FormCard>
        <ActionForm action={schoolAction}>
          <Field label="Nombre de la escuela">
            <Input name="schoolName" defaultValue={s.schoolName} required />
          </Field>
          <Field label="Logo" hint="Imagen cuadrada, máximo 2 MB. Se ve en la entrada y en la pestaña del navegador.">
            <div className="flex items-center gap-3">
              {brand.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logoUrl} alt="Logo actual" className="h-12 w-12 rounded-lg border border-line object-contain" />
              )}
              <input type="file" name="logo" accept="image/*" className="block w-full text-sm file:mr-3 file:h-10 file:rounded-lg file:border-0 file:bg-field file:px-3 file:font-semibold" />
            </div>
          </Field>
          <SubmitButton size="md">Guardar</SubmitButton>
        </ActionForm>
      </FormCard>
      <SectionTitle>Parámetros</SectionTitle>
      <FormCard>
        <ActionForm action={paramsAction}>
          <Field label="Días de anticipación para clientes" hint="Hasta cuántos días adelante reserva un cliente (D-08).">
            <Input name="clientMaxDays" type="number" min={1} max={365} defaultValue={s.clientMaxDays} required />
          </Field>
          <Field label="Días de anticipación para profesores y administradores">
            <Input name="staffMaxDays" type="number" min={1} max={365} defaultValue={s.staffMaxDays} required />
          </Field>
          <Field label="Turnos seguidos por reserva de un cliente" hint="D-09.">
            <Input name="clientMaxTurns" type="number" min={1} max={10} defaultValue={s.clientMaxTurns} required />
          </Field>
          <Field label="Frecuencia de liquidación" hint="Semanal: lunes a domingo. Quincenal: 1–15 y 16–fin de mes. Mensual: mes calendario (CA-50).">
            <Select name="payrollFrequency" defaultValue={s.payrollFrequency}>
              <option value="semanal">Semanal</option>
              <option value="quincenal">Quincenal</option>
              <option value="mensual">Mensual</option>
            </Select>
          </Field>
          <SubmitButton size="md">Guardar parámetros</SubmitButton>
        </ActionForm>
      </FormCard>
    </>
  );
}
