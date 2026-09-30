import { ActionForm, SubmitButton } from "@/components/forms";
import { FormCard, Input, PageHeader, SectionTitle, Select } from "@/components/ui";
import { listReasons } from "@/server/config";
import { ctxOf, requireUser } from "@/server/session";
import { reasonAction } from "../actions";

export const metadata = { title: "Motivos" };

export default async function MotivosPage() {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const list = await listReasons(ctx.db, false);
  return (
    <>
      <PageHeader back={{ href: "/configuracion", label: "Configuración" }} title="Motivos" />
      <p className="px-4 text-sm text-muted">Se usan al cancelar una clase y al cerrar un alquiler como no usado.</p>
      <SectionTitle>Lista</SectionTitle>
      <div className="space-y-2">
        {list.map((r) => (
          <FormCard key={r.id}>
            <ActionForm action={reasonAction} className="grid grid-cols-[1fr_120px] items-start gap-2 space-y-0">
              <input type="hidden" name="id" value={r.id} />
              <Input name="label" defaultValue={r.label} aria-label="Motivo" required />
              <Select name="isActive" defaultValue={r.isActive ? "1" : "0"} aria-label="Estado">
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </Select>
              <div className="col-span-2">
                <SubmitButton size="sm" variant="secondary">Guardar</SubmitButton>
              </div>
            </ActionForm>
          </FormCard>
        ))}
      </div>
      <SectionTitle>Nuevo motivo</SectionTitle>
      <FormCard>
        <ActionForm action={reasonAction} onSuccess="reset">
          <input type="hidden" name="isActive" value="1" />
          <Input name="label" placeholder="Ej. Cancha en mantenimiento" aria-label="Motivo" required />
          <SubmitButton size="md">Agregar motivo</SubmitButton>
        </ActionForm>
      </FormCard>
    </>
  );
}
