import { FormCard, PageHeader } from "@/components/ui";
import { usersWithRole } from "@/server/people";
import { ctxOf, requireUser } from "@/server/session";
import { createChildAction } from "../../actions";
import { ChildForm } from "../../forms";

export const metadata = { title: "Nuevo niño" };

export default async function NuevoNinoPage({ searchParams }: PageProps<"/personas/ninos/nuevo">) {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const sp = await searchParams;
  const clients = await usersWithRole(ctx.db, "cliente");
  return (
    <>
      <PageHeader back={{ href: "/personas?tab=ninos", label: "Personas" }} title="Nuevo niño" />
      <p className="px-4 text-sm text-muted">Los niños no tienen usuario: sus clientes a cargo ven su información.</p>
      <div className="mt-3">
        <FormCard>
          <ChildForm action={createChildAction} clients={clients} isNew defaults={{ guardianIds: typeof sp.cliente === "string" ? [sp.cliente] : [] }} />
        </FormCard>
      </div>
    </>
  );
}
