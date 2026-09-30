import { Badge, Empty, Group, LinkButton, PageHeader, Row } from "@/components/ui";
import { listGroups } from "@/server/groups";
import { ctxOf, requireUser } from "@/server/session";

export const metadata = { title: "Grupos" };

export default async function GruposPage() {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const list = await listGroups(ctx.db);
  return (
    <>
      <PageHeader eyebrow="Administración" title="Grupos" action={<LinkButton href="/grupos/nuevo" icon="plus">Grupo</LinkButton>} />
      <div className="mt-3">
        {list.length === 0 ? (
          <Group><Empty>Todavía no hay grupos. Crea uno para reservar sus turnos en la agenda.</Empty></Group>
        ) : (
          <Group>
            {list.map((g) => (
              <Row
                key={g.id}
                href={`/grupos/${g.id}`}
                leading={<span className="flex h-9 w-12 items-center justify-center rounded-md border border-cell-grp-line bg-cell-grp text-[11px] font-semibold text-info-ink">{g.code}</span>}
                title={g.name}
                subtitle={`${g.profesor}${g.capacity ? ` · cupo ${g.capacity}` : ""}`}
                trailing={!g.isActive ? <Badge>Inactivo</Badge> : undefined}
              />
            ))}
          </Group>
        )}
      </div>
    </>
  );
}
