import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, FormCard, Input, PageHeader, SectionTitle, Select } from "@/components/ui";
import { money } from "@/lib/format";
import { listPackages } from "@/server/config";
import { ctxOf, requireUser } from "@/server/session";
import { packageAction } from "../actions";

export const metadata = { title: "Paquetes" };

function PackageFields({ p }: { p?: { name: string; kind: string; classCount: number; price: number; isActive: boolean } }) {
  return (
    <>
      <Field label="Nombre"><Input name="name" defaultValue={p?.name} required placeholder="Ej. Paquete 8 individuales" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <Select name="kind" defaultValue={p?.kind ?? "individual"}>
            <option value="individual">Individual</option>
            <option value="grupal">Grupal</option>
          </Select>
        </Field>
        <Field label="Clases" hint="Mínimo 4."><Input name="classCount" type="number" min={1} defaultValue={p?.classCount ?? 4} required /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Precio (COP)"><Input name="price" inputMode="numeric" defaultValue={p?.price ?? ""} required /></Field>
        <Field label="Estado">
          <Select name="isActive" defaultValue={p?.isActive === false ? "0" : "1"}>
            <option value="1">Activo</option>
            <option value="0">Desactivado</option>
          </Select>
        </Field>
      </div>
    </>
  );
}

export default async function PaquetesPage() {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const list = await listPackages(ctx.db);
  return (
    <>
      <PageHeader back={{ href: "/configuracion", label: "Configuración" }} title="Paquetes" />
      <p className="px-4 text-sm text-muted">Desactivar un paquete no afecta a quienes ya lo compraron. Las clases no vencen.</p>
      {list.map((p) => (
        <div key={p.id}>
          <SectionTitle aside={money(p.price)}>{p.name}</SectionTitle>
          <FormCard>
            <ActionForm action={packageAction}>
              <input type="hidden" name="id" value={p.id} />
              <PackageFields p={p} />
              <SubmitButton size="md" variant="secondary">Guardar</SubmitButton>
            </ActionForm>
          </FormCard>
        </div>
      ))}
      <SectionTitle>Nuevo paquete</SectionTitle>
      <FormCard>
        <ActionForm action={packageAction} onSuccess="reset">
          <PackageFields />
          <SubmitButton size="md">Crear paquete</SubmitButton>
        </ActionForm>
      </FormCard>
    </>
  );
}
