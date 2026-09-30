import Link from "next/link";
import { Avatar, Badge, Empty, Group, LinkButton, PageHeader, Row } from "@/components/ui";
import { signedPhotoUrls } from "@/lib/supabase/admin";
import type { Role } from "@/server/context";
import { listChildren, listUsers, ROLE_LABEL } from "@/server/people";
import { ctxOf, requireUser } from "@/server/session";
import { PeopleFilter } from "./people-filter";

export const metadata = { title: "Personas" };

export default async function PersonasPage({ searchParams }: PageProps<"/personas">) {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const sp = await searchParams;
  const tab = sp.tab === "ninos" ? "ninos" : "usuarios";
  const role = typeof sp.rol === "string" ? (sp.rol as Role) : null;
  const q = typeof sp.q === "string" ? sp.q : "";
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const tabs = (
    <div className="mx-4 mt-3 grid grid-cols-2 gap-[3px] rounded-[10px] bg-field p-[3px] text-sm">
      <Link href="/personas" className={`flex h-10 items-center justify-center rounded-lg ${tab === "usuarios" ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}>Usuarios</Link>
      <Link href="/personas?tab=ninos" className={`flex h-10 items-center justify-center rounded-lg ${tab === "ninos" ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}>Niños</Link>
    </div>
  );

  if (tab === "ninos") {
    const kids = (await listChildren(ctx.db)).filter((k) => !q || norm(k.fullName).includes(norm(q)));
    return (
      <>
        <PageHeader eyebrow="Administración" title="Personas" action={<LinkButton href="/personas/ninos/nuevo" icon="plus">Niño</LinkButton>} />
        {tabs}
        <PeopleFilter tab="ninos" q={q} />
        <div className="mt-3">
          {kids.length === 0 ? <Group><Empty>No hay niños.</Empty></Group> : (
            <Group>
              {kids.map((k) => (
                <Row key={k.id} href={`/personas/ninos/${k.id}`} title={k.fullName} subtitle={k.guardians.length ? `A cargo de ${k.guardians.join(", ")}` : "Sin cliente a cargo"} trailing={!k.isActive ? <Badge>Inactivo</Badge> : undefined} />
              ))}
            </Group>
          )}
        </div>
      </>
    );
  }

  const users = (await listUsers(ctx.db)).filter((u) => (!role || u.roles.includes(role)) && (!q || norm(u.fullName).includes(norm(q)) || u.email.includes(q.toLowerCase())));
  const photos = await signedPhotoUrls(users.map((u) => u.photoPath ?? "").filter(Boolean)).catch(() => new Map<string, string>());
  return (
    <>
      <PageHeader eyebrow="Administración" title="Personas" action={<LinkButton href="/personas/nuevo" icon="plus">Usuario</LinkButton>} />
      {tabs}
      <PeopleFilter tab="usuarios" q={q} role={role} />
      <div className="mt-3">
        {users.length === 0 ? <Group><Empty>No hay usuarios con ese filtro.</Empty></Group> : (
          <Group>
            {users.map((u) => (
              <Row
                key={u.id}
                href={`/personas/${u.id}`}
                leading={<Avatar name={u.fullName} src={u.photoPath ? photos.get(u.photoPath) : null} size={36} />}
                title={u.fullName}
                subtitle={u.roles.map((r) => ROLE_LABEL[r]).join(" · ")}
                trailing={!u.isActive ? <Badge>Inactivo</Badge> : undefined}
              />
            ))}
          </Group>
        )}
      </div>
    </>
  );
}
