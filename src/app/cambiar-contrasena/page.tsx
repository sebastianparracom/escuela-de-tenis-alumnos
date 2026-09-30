import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { getSessionUser } from "@/server/session";
import { changePassword } from "./actions";

export const metadata = { title: "Cambiar contraseña" };

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <h1 className="text-[28px] font-bold tracking-[-0.03em]">Cambia tu contraseña</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        {user.mustChangePassword ? "Antes de continuar, escoge una contraseña personal." : "Escoge tu nueva contraseña."}
      </p>
      <div className="rounded-[14px] border border-line bg-surface p-4">
        <ActionForm action={changePassword}>
          <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
            <Input type="password" name="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Repite la contraseña">
            <Input type="password" name="confirm" autoComplete="new-password" minLength={8} required />
          </Field>
          <SubmitButton>Guardar contraseña</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
