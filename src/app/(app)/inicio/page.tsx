import Link from "next/link";
import { Badge, Empty, Group, LinkButton, Notice, PageHeader, Row, SectionTitle, TimeBlock } from "@/components/ui";
import { money, shortDate } from "@/lib/format";
import { hhmm, localDate, localMinute } from "@/lib/time";
import { getBranding } from "@/server/branding";
import { clientRentals, clientStudents, studentClasses } from "@/server/queries";
import { ctxOf, requireUser } from "@/server/session";

export const metadata = { title: "Inicio" };

function fmt(n: number) {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

/** CA-40: bolsas propias y de cada niño, próximas clases y alquileres con lo que se debe. */
export default async function InicioPage() {
  const user = await requireUser(["cliente"]);
  const ctx = await ctxOf(user);
  const brand = await getBranding();
  const today = localDate(ctx.now);
  const cards = await clientStudents(ctx.db, user.id, user.fullName);
  const upcoming = (
    await Promise.all(cards.map(async (c) => (await studentClasses(ctx.db, c.studentId, c.childId, { upcoming: ctx.now })).map((x) => ({ ...x, who: c.isSelf ? "Tú" : c.name.split(" ")[0] }))))
  )
    .flat()
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  // Una clase de grupo con dos hermanos aparece una vez.
  const merged = new Map<string, (typeof upcoming)[number]>();
  for (const u of upcoming) {
    const cur = merged.get(u.id);
    merged.set(u.id, cur ? { ...cur, who: `${cur.who} y ${u.who}` } : u);
  }
  const rentals = (await clientRentals(ctx.db, user.id)).filter((r) => r.localDate >= today || r.account.outstanding > 0).filter((r) => r.status !== "cancelada_cliente");
  const owed = rentals.reduce((s, r) => s + Math.max(0, r.account.outstanding), 0);
  const negatives = cards.flatMap((c) => [
    ...(c.balances.individual < 0 ? [`${c.isSelf ? "Tienes" : `${c.name.split(" ")[0]} tiene`} ${-c.balances.individual} clase(s) individual(es) por pagar`] : []),
    ...(c.balances.grupal < 0 ? [`${c.isSelf ? "Tienes" : `${c.name.split(" ")[0]} tiene`} ${-c.balances.grupal} clase(s) grupal(es) por pagar`] : []),
  ]);

  return (
    <>
      <PageHeader eyebrow={brand.name} title={`Hola, ${user.fullName.split(" ")[0]}`} action={<LinkButton href="/reservar" icon="plus">Reservar</LinkButton>} />
      {cards.map((c) => (
        <div key={c.studentId}>
          <SectionTitle>{c.isSelf ? `${c.name.split(" ")[0]} (tú)` : c.name}</SectionTitle>
          <Group>
            <Row
              href={`/historial?alumno=${c.studentId}`}
              title="Bolsa individual"
              trailing={
                <span className="flex items-center gap-2">
                  {c.balances.individual < 0 && <Badge tone="red">Por pagar</Badge>}
                  <span className={`font-mono text-[17px] font-semibold ${c.balances.individual < 0 ? "text-danger" : ""}`}>{fmt(c.balances.individual)}</span>
                </span>
              }
            />
            {!c.isSelf && (
              <Row
                href={`/historial?alumno=${c.studentId}`}
                title="Bolsa grupal"
                trailing={
                  <span className="flex items-center gap-2">
                    {c.balances.grupal < 0 && <Badge tone="red">Por pagar</Badge>}
                    <span className={`font-mono text-[17px] font-semibold ${c.balances.grupal < 0 ? "text-danger" : ""}`}>{fmt(c.balances.grupal)}</span>
                  </span>
                }
              />
            )}
          </Group>
        </div>
      ))}
      {negatives.length > 0 && (
        <div className="mt-3">
          <Notice tone="red">{negatives.join(". ")}.</Notice>
        </div>
      )}

      <SectionTitle>Próximas clases</SectionTitle>
      {merged.size === 0 ? (
        <Group><Empty>No hay clases agendadas.</Empty></Group>
      ) : (
        <Group>
          {[...merged.values()].slice(0, 6).map((c) => (
            <Row
              key={c.id}
              leading={<TimeBlock top={shortDate(c.localDate)} bottom={hhmm(localMinute(c.startsAt))} />}
              title={c.who}
              subtitle={`${c.title} · ${c.court}${c.profesor ? ` · con ${c.profesor.split(" ")[0]}` : ""}`}
            />
          ))}
        </Group>
      )}

      <SectionTitle aside={owed > 0 ? `Debes ${money(owed)}` : undefined}>Mis alquileres</SectionTitle>
      {rentals.length === 0 ? (
        <Group>
          <Empty>
            No tienes alquileres próximos. <Link href="/reservar" className="font-semibold text-brand">Reservar cancha</Link>
          </Empty>
        </Group>
      ) : (
        <Group>
          {rentals.map((r) => (
            <Row
              key={r.id}
              href={`/reservas/${r.id}`}
              title={`${shortDate(r.localDate)} · ${hhmm(localMinute(r.startsAt))} – ${hhmm(localMinute(r.endsAt))}`}
              subtitle={`${r.court} · ${r.turns} turno${r.turns > 1 ? "s" : ""}${r.nightTurns ? " · nocturno" : ""}`}
              trailing={
                <div className="text-right">
                  <div className="font-mono text-[15px] font-semibold">{money(r.account.value)}</div>
                  <div className={`text-[11px] font-semibold ${r.account.outstanding > 0 ? "text-danger" : "text-brand"}`}>
                    {r.account.outstanding > 0 ? "Por pagar" : "Pagado"}
                  </div>
                </div>
              }
            />
          ))}
        </Group>
      )}
    </>
  );
}
