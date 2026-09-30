import { ActionForm, SubmitButton } from "@/components/forms";
import { FormCard, Input, PageHeader, SectionTitle, Select } from "@/components/ui";
import { listCourts } from "@/server/config";
import { ctxOf, requireUser } from "@/server/session";
import { courtAction } from "../actions";

export const metadata = { title: "Canchas" };

export default async function CanchasPage() {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const courts = await listCourts(ctx.db);
  return (
    <>
      <PageHeader back={{ href: "/configuracion", label: "Configuración" }} title="Canchas" />
      <SectionTitle>{courts.filter((c) => c.isActive).length} activas</SectionTitle>
      <div className="space-y-2">
        {courts.map((c) => (
          <FormCard key={c.id}>
            <ActionForm action={courtAction} className="grid grid-cols-[1fr_120px] items-start gap-2 space-y-0">
              <input type="hidden" name="id" value={c.id} />
              <Input name="name" defaultValue={c.name} aria-label="Nombre" required />
              <Select name="isActive" defaultValue={c.isActive ? "1" : "0"} aria-label="Estado">
                <option value="1">Activa</option>
                <option value="0">Inactiva</option>
              </Select>
              <div className="col-span-2">
                <SubmitButton size="sm" variant="secondary">Guardar</SubmitButton>
              </div>
            </ActionForm>
          </FormCard>
        ))}
      </div>
      <SectionTitle>Nueva cancha</SectionTitle>
      <FormCard>
        <ActionForm action={courtAction} onSuccess="reset">
          <input type="hidden" name="isActive" value="1" />
          <Input name="name" placeholder="Ej. Cancha 8" aria-label="Nombre" required />
          <SubmitButton size="md">Agregar cancha</SubmitButton>
        </ActionForm>
      </FormCard>
    </>
  );
}
