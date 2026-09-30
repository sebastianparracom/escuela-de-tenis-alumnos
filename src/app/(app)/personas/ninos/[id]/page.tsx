import { inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, FormCard, Group, LinkButton, Notice, PageHeader, Row, SectionTitle } from "@/components/ui";
import { groups } from "@/db/schema";
import { DomainError } from "@/lib/errors";
import { fullDate } from "@/lib/format";
import { signedPhotoUrls } from "@/lib/supabase/admin";
import { localDate } from "@/lib/time";
import { balancesOf } from "@/server/payments";
import { getChildFull, usersWithRole } from "@/server/people";
import { ctxOf, requireUser } from "@/server/session";
import { toggleChildAction, updateChildAction } from "../../actions";
import { ChildForm } from "../../forms";

export const metadata = { title: "Niño" };

export default async function NinoPage({ params, searchParams }: PageProps<"/personas/ninos/[id]">) {
  const me = await requireUser(["admin"]);
  const ctx = await ctxOf(me);
  const { id } = await params;
  const sp = await searchParams;
  let c;
  try {
    c = await getChildFull(ctx.db, id);
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
  const today = localDate(ctx.now);
  const [bal, clients, photos] = await Promise.all([
    balancesOf(ctx.db, c.studentId),
    usersWithRole(ctx.db, "cliente", false),
    c.photoPath ? signedPhotoUrls([c.photoPath]).catch(() => new Map<string, string>()) : Promise.resolve(new Map<string, string>()),
  ]);
  const active = c.memberships.filter((m) => !m.leftOn || m.leftOn > today);
  const groupRows = active.length ? await ctx.db.select({ id: groups.id, name: groups.name }).from(groups).where(inArray(groups.id, active.map((m) => m.groupId))) : [];
  return (
    <>
      <PageHeader back={{ href: "/personas?tab=ninos", label: "Personas" }} title={c.fullName} eyebrow="Niño a cargo" />
      {sp.creado && <div className="mt-2"><Notice tone="green">Niño creado. Sus bolsas arrancan en cero.</Notice></div>}
      {!c.isActive && <div className="mt-2"><Notice tone="red">Niño desactivado.</Notice></div>}
      <div className="flex justify-center py-3">
        <Avatar name={c.fullName} src={c.photoPath ? photos.get(c.photoPath) : null} size={72} />
      </div>
      <div className="mx-4 grid grid-cols-2 divide-x divide-line rounded-xl border border-line bg-surface">
        <div className="px-3 py-2.5"><div className={`font-mono text-lg font-semibold ${bal.individual < 0 ? "text-danger" : ""}`}>{bal.individual}</div><div className="text-[11px] text-muted">Bolsa individual</div></div>
        <div className="px-3 py-2.5"><div className={`font-mono text-lg font-semibold ${bal.grupal < 0 ? "text-danger" : ""}`}>{bal.grupal}</div><div className="text-[11px] text-muted">Bolsa grupal</div></div>
      </div>
      <div className="mx-4 mt-3">
        <LinkButton href={`/pagos/nuevo?cliente=${c.guardians[0]?.id ?? ""}&alumno=${c.studentId}`} icon="wallet" variant="secondary" full>Registrar pago</LinkButton>
      </div>
      <SectionTitle>Grupos</SectionTitle>
      <Group>
        {groupRows.length === 0 ? <Row title="No está inscrito en grupos" /> : groupRows.map((g) => {
          const m = active.find((x) => x.groupId === g.id)!;
          return <Row key={g.id} href={`/grupos/${g.id}`} title={g.name} subtitle={`Desde ${fullDate(m.joinedOn)}`} />;
        })}
      </Group>
      <SectionTitle>Datos</SectionTitle>
      <FormCard>
        <ChildForm action={updateChildAction.bind(null, id)} clients={clients} isNew={false} defaults={{ ...c, guardianIds: c.guardians.map((g) => g.id) }} />
      </FormCard>
      <SectionTitle>Estado</SectionTitle>
      <FormCard>
        <ActionForm action={toggleChildAction.bind(null, id, !c.isActive)} confirm={c.isActive ? "¿Desactivar este niño? Saldrá de sus grupos; su historial se conserva." : undefined}>
          <SubmitButton variant={c.isActive ? "danger" : "primary"} size="md">{c.isActive ? "Desactivar niño" : "Activar niño"}</SubmitButton>
        </ActionForm>
      </FormCard>
    </>
  );
}
