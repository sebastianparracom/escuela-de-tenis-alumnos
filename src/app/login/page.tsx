import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Icon } from "@/components/icons";
import { Field, Input } from "@/components/ui";
import { getBranding } from "@/server/branding";
import { adminCount } from "@/server/install";
import { getSessionUser } from "@/server/session";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { devAuthEnabled } from "@/lib/dev-auth";
import { devLogin, login } from "./actions";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSessionUser()) redirect("/");
  const { name, logoUrl } = await getBranding();
  const sp = await searchParams;
  const needsInstall = (await adminCount().catch(() => 1)) === 0;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-16 w-16 rounded-2xl object-contain" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-white">
            <Icon name="ball" size={34} strokeWidth={1.8} />
          </span>
        )}
        <h1 className="text-[28px] font-bold tracking-[-0.03em]">{name}</h1>
      </div>
      {sp.instalado && <p className="mb-3 rounded-xl bg-brand-soft px-3.5 py-3 text-[13px] text-brand-dark">Administrador creado. Ya puedes entrar.</p>}
      {needsInstall && (
        <p className="mb-3 rounded-xl bg-field px-3.5 py-3 text-[13px] text-ink-2">
          La escuela aún no tiene administrador. <Link href="/instalacion" className="font-semibold text-brand">Hacer la configuración inicial</Link>
        </p>
      )}
      <div className="rounded-[14px] border border-line bg-surface p-4">
        <ActionForm action={login}>
          <Field label="Correo">
            <Input type="email" name="email" autoComplete="email" inputMode="email" required />
          </Field>
          <Field label="Contraseña">
            <Input type="password" name="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
        </ActionForm>
      </div>
      {devAuthEnabled() && (
        <div className="mt-6 rounded-[14px] border border-dashed border-line p-4">
          <p className="mb-2 text-xs font-semibold text-muted">DESARROLLO LOCAL · entrar como</p>
          <div className="grid gap-2">
            {(await getDb().select({ id: profiles.id, name: profiles.fullName, email: profiles.email }).from(profiles).orderBy(asc(profiles.email))).map((p) => (
              <form key={p.id} action={devLogin.bind(null, p.id)}>
                <button className="flex h-11 w-full items-center justify-between rounded-xl bg-surface px-3 text-sm">
                  <span>{p.name}</span>
                  <span className="text-xs text-muted">{p.email.split("@")[0]}</span>
                </button>
              </form>
            ))}
          </div>
        </div>
      )}
      <p className="mt-6 text-center text-xs text-muted">¿Olvidaste tu contraseña? Pide a la administración que la restablezca.</p>
    </main>
  );
}
