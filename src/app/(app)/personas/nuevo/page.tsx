import { FormCard, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/session";
import { createUserAction } from "../actions";
import { UserForm } from "../forms";

export const metadata = { title: "Nuevo usuario" };

export default async function NuevoUsuarioPage() {
  await requireUser(["admin"]);
  return (
    <>
      <PageHeader back={{ href: "/personas", label: "Personas" }} title="Nuevo usuario" />
      <div className="mt-3">
        <FormCard>
          <UserForm action={createUserAction} isNew defaults={{ roles: ["cliente"] }} />
        </FormCard>
      </div>
    </>
  );
}
