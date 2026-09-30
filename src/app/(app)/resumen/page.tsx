import { Empty, Group, PageHeader, Row, SectionTitle } from "@/components/ui";
import { fullDate, money } from "@/lib/format";
import { addDays, isValidDate, localDate } from "@/lib/time";
import { businessSummary } from "@/server/reports";
import { ctxOf, requireUser } from "@/server/session";

export const metadata = { title: "Resumen del negocio" };

/** CA-53: ingresos por medio, clases, cancelaciones por motivo, alquileres, ocupación y saldos por cobrar. */
export default async function ResumenPage({ searchParams }: PageProps<"/resumen">) {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const sp = await searchParams;
  const today = localDate(ctx.now);
  const monthStart = `${today.slice(0, 8)}01`;
  const from = typeof sp.desde === "string" && isValidDate(sp.desde) ? sp.desde : monthStart;
  let to = typeof sp.hasta === "string" && isValidDate(sp.hasta) ? sp.hasta : today;
  if (to < from) to = from;
  if (to > addDays(from, 366)) to = addDays(from, 366);
  const s = await businessSummary(ctx.db, from, to);
  const presets = [
    ["Este mes", monthStart, today],
    ["Últimos 7 días", addDays(today, -6), today],
    ["Últimos 30 días", addDays(today, -29), today],
  ] as const;
  return (
    <>
      <PageHeader eyebrow="Administración" title="Resumen" />
      <form action="/resumen" className="mx-4 mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-[14px] border border-line bg-surface p-3">
        <label className="text-xs font-semibold text-muted">
          Desde
          <input type="date" name="desde" defaultValue={from} className="mt-1 block h-11 w-full rounded-lg border border-line px-2 text-sm text-ink" />
        </label>
        <label className="text-xs font-semibold text-muted">
          Hasta
          <input type="date" name="hasta" defaultValue={to} className="mt-1 block h-11 w-full rounded-lg border border-line px-2 text-sm text-ink" />
        </label>
        <button type="submit" className="h-11 rounded-lg bg-brand px-3 text-sm font-semibold text-white">Ver</button>
      </form>
      <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-4">
        {presets.map(([l, a, b]) => (
          <a key={l} href={`/resumen?desde=${a}&hasta=${b}`} className={`flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] ${from === a && to === b ? "bg-ink font-semibold text-white" : "border border-line bg-surface"}`}>{l}</a>
        ))}
      </div>
      <p className="px-6 pt-2 text-xs text-muted">{fullDate(from)} – {fullDate(to)}</p>

      <SectionTitle>Ingresos registrados</SectionTitle>
      <Group>
        <Row title="Efectivo" trailing={<span className="font-mono font-semibold">{money(s.income.efectivo)}</span>} />
        <Row title="Transferencia" trailing={<span className="font-mono font-semibold">{money(s.income.transferencia)}</span>} />
        <Row title="Total" subtitle={`${s.income.count} pagos`} trailing={<span className="font-mono text-lg font-semibold">{money(s.income.efectivo + s.income.transferencia)}</span>} />
      </Group>

      <SectionTitle>Clases</SectionTitle>
      <Group>
        <Row title="Individuales dictadas" trailing={<span className="font-mono font-semibold">{s.classes.individualDictadas}</span>} />
        <Row title="Grupales dictadas" trailing={<span className="font-mono font-semibold">{s.classes.grupalDictadas}</span>} />
        {s.classes.canceladas.length === 0 ? <Row title="Canceladas" trailing={<span className="font-mono font-semibold">0</span>} /> : s.classes.canceladas.map((c) => (
          <Row key={c.reason} title={`Canceladas · ${c.reason}`} trailing={<span className="font-mono font-semibold">{c.n}</span>} />
        ))}
      </Group>

      <SectionTitle>Alquileres y ocupación</SectionTitle>
      <Group>
        <Row title="Alquileres usados" trailing={<span className="font-mono font-semibold">{s.rentals.usados}</span>} />
        <Row title="Alquileres no usados" trailing={<span className="font-mono font-semibold">{s.rentals.noUsados}</span>} />
        <Row title="Cancelados por el cliente" trailing={<span className="font-mono font-semibold">{s.rentals.cancelados}</span>} />
        <Row title="Ocupación de canchas" subtitle={`${s.occupancy.occupied} de ${s.occupancy.available} turnos`} trailing={<span className="font-mono text-lg font-semibold">{s.occupancy.percent}%</span>} />
      </Group>

      <SectionTitle aside={money(s.receivables.rentalsTotal)}>Saldos por cobrar</SectionTitle>
      {s.receivables.bags.length === 0 && s.receivables.rentals.length === 0 ? (
        <Group><Empty>No hay saldos por cobrar.</Empty></Group>
      ) : (
        <Group>
          {s.receivables.bags.map((b) => (
            <Row key={`${b.studentId}-${b.bag}`} title={b.name} subtitle={`Bolsa ${b.bag}`} trailing={<span className="font-mono font-semibold text-danger">{-b.total} clase(s)</span>} />
          ))}
          {s.receivables.rentals.map((r) => (
            <Row key={r.client} title={r.client} subtitle={`${r.rentals} alquiler(es)`} trailing={<span className="font-mono font-semibold text-danger">{money(r.amount)}</span>} />
          ))}
        </Group>
      )}
      {s.receivables.credit.length > 0 && (
        <>
          <SectionTitle>Pagos por anular</SectionTitle>
          <Group>
            {s.receivables.credit.map((c) => (
              <Row key={c.bookingId} href={`/reservas/${c.bookingId}`} title={c.client} subtitle="Alquiler cancelado o no usado con pago registrado" trailing={<span className="font-mono">{money(c.amount)}</span>} />
            ))}
          </Group>
        </>
      )}
    </>
  );
}
