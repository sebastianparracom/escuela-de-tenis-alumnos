import Link from "next/link";
import { connection } from "next/server";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { adminCount } from "@/server/install";
import { installAction } from "./actions";

export const metadata = { title: "Instalación" };

export default async function InstalacionPage() {
  await connection();
  const done = (await adminCount()) > 0;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <h1 className="text-[28px] font-bold tracking-[-0.03em]">Configuración inicial</h1>
      {done ? (
        <p className="mt-2 text-sm text-muted">
          La escuela ya tiene administrador. <Link href="/login" className="font-semibold text-brand">Entrar</Link>
        </p>
      ) : (
        <>
          <p className="mt-1 mb-6 text-sm text-muted">Crea la primera cuenta de administrador. Solo se puede hacer una vez.</p>
          <div className="rounded-[14px] border border-line bg-surface p-4">
            <ActionForm action={installAction}>
              <Field label="Código de instalación" hint="Es el valor de CRON_SECRET configurado en Vercel.">
                <Input name="code" type="password" required autoComplete="off" />
              </Field>
              <Field label="Nombre completo"><Input name="fullName" required /></Field>
              <Field label="Correo"><Input name="email" type="email" required autoComplete="email" /></Field>
              <Field label="Teléfono"><Input name="phone" type="tel" /></Field>
              <Field label="Contraseña" hint="Mínimo 8 caracteres."><Input name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
              <Field label="Repite la contraseña"><Input name="confirm" type="password" minLength={8} required autoComplete="new-password" /></Field>
              <SubmitButton>Crear administrador</SubmitButton>
            </ActionForm>
          </div>
        </>
      )}
    </main>
  );
}
