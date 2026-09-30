import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, Badge, Field, FormCard, Group, Input, LinkButton, Notice, PageHeader, Row, SectionTitle } from "@/components/ui";
import { DomainError } from "@/lib/errors";
import { signedPhotoUrls } from "@/lib/supabase/admin";
import { balancesOf } from "@/server/payments";
import { childrenOf, getUserFull, ROLE_LABEL, studentIdOfProfile } from "@/server/people";
import { ctxOf, requireUser } from "@/server/session";
import { resetPasswordAction, toggleUserAction, updateUserAction } from "../actions";
import { UserForm } from "../forms";

export const metadata = { title: "Usuario" };

export default async function UsuarioPage({ params, searchParams }: PageProps<"/personas/[id]">) {
  const me = await requireUser(["admin"]);
  const ctx = await ctxOf(me);
  const { id } = await params;
  const sp = await searchParams;
  let u;
  try {
    u = await getUserFull(ctx.db, id);
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
  const photos = u.photoPath ? await signedPhotoUrls([u.photoPath]).catch(() => new Map()) : new Map();
  const isClient = u.roles.includes("cliente");
  const selfStudent = isClient ? await studentIdOfProfile(ctx.db, id) : null;
  const selfBal = selfStudent ? await balancesOf(ctx.db, selfStudent) : null;
  const kids = isClient ? await childrenOf(ctx.db, id) : [];
  const kidBal = await Promise.all(kids.map((k) => balancesOf(ctx.db, k.studentId)));
  return (
    <>
      <PageHeader back={{ href: "/personas", label: "Personas" }} title={u.fullName} eyebrow={u.roles.map((r) => ROLE_LABEL[r]).join(" · ")} />
      {sp.creado && <div className="mt-2"><Notice tone="green">Usuario creado. Entrégale su correo y la contraseña temporal.</Notice></div>}
      {!u.isActive && <div className="mt-2"><Notice tone="red">Usuario desactivado: no puede entrar.</Notice></div>}
      <div className="flex justify-center py-3">
        <Avatar name={u.fullName} src={u.photoPath ? photos.get(u.photoPath) : null} size={72} />
      </div>

      {isClient && (
        <>
          <SectionTitle>Bolsas</SectionTitle>
          <Group>
            {selfBal && <Row title={`${u.fullName.split(" ")[0]} (cliente)`} subtitle="Bolsa individual" trailing={<span className={`font-mono font-semibold ${selfBal.individual < 0 ? "text-danger" : ""}`}>{selfBal.individual}</span>} />}
            {kids.map((k, i) => (
              <Row
                key={k.id}
                href={`/personas/ninos/${k.id}`}
                title={k.fullName}
                subtitle={`Individual ${kidBal[i].individual} · Grupal ${kidBal[i].grupal}`}
                trailing={!k.isActive ? <Badge>Inactivo</Badge> : undefined}
              />
            ))}
          </Group>
          <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
            <LinkButton href={`/pagos/nuevo?cliente=${id}`} icon="wallet" variant="secondary">Registrar pago</LinkButton>
            <LinkButton href={`/personas/ninos/nuevo?cliente=${id}`} icon="plus" variant="secondary">Agregar niño</LinkButton>
          </div>
        </>
      )}

      <SectionTitle>Datos</SectionTitle>
      <FormCard>
        <UserForm action={updateUserAction.bind(null, id)} isNew={false} defaults={u} />
      </FormCard>

      <SectionTitle>Contraseña</SectionTitle>
      <FormCard>
        <ActionForm action={resetPasswordAction.bind(null, id)} onSuccess="reset">
          <Field label="Nueva contraseña temporal" hint="El usuario deberá cambiarla al entrar.">
            <Input name="password" type="text" minLength={8} required autoComplete="off" />
          </Field>
          <SubmitButton variant="secondary" size="md">Restablecer contraseña</SubmitButton>
        </ActionForm>
      </FormCard>

      {id !== me.id && (
        <>
          <SectionTitle>Acceso</SectionTitle>
          <FormCard>
            <ActionForm
              action={toggleUserAction.bind(null, id, !u.isActive)}
              confirm={u.isActive ? "¿Desactivar este usuario? No podrá entrar; su historial se conserva." : undefined}
            >
              <p className="text-sm text-muted">{u.isActive ? "Si lo desactivas, deja de entrar. Su historial se conserva." : "Al activarlo vuelve a poder entrar."}</p>
              <SubmitButton variant={u.isActive ? "danger" : "primary"} size="md">{u.isActive ? "Desactivar usuario" : "Activar usuario"}</SubmitButton>
            </ActionForm>
          </FormCard>
        </>
      )}
    </>
  );
}
