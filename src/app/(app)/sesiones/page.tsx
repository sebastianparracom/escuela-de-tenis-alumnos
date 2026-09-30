import Link from "next/link";
import { Empty, Group, PageHeader, Row, SectionTitle, TimeBlock } from "@/components/ui";
import { fullDate, shortDate } from "@/lib/format";
import { nextPeriod, periodFor, previousPeriod } from "@/lib/periods";
import { hhmm, isValidDate, localDate, localMinute } from "@/lib/time";
import { getSettings } from "@/server/config";
import { personSessions } from "@/server/payroll";
import { ctxOf, requireUser } from "@/server/session";

export const metadata = { title: "Sesiones" };

/** CA-41 y CA-42: sesiones del período de liquidación con su detalle. */
export default async function SesionesPage({ searchParams }: PageProps<"/sesiones">) {
  const user = await requireUser(["profesor", "caddie"]);
  const ctx = await ctxOf(user);
  const sp = await searchParams;
  const settings = await getSettings(ctx.db);
  const ref = typeof sp.desde === "string" && isValidDate(sp.desde) ? sp.desde : localDate(ctx.now);
  const period = periodFor(ref, settings.payrollFrequency);
  const { rows } = await personSessions(ctx.db, user.id, period);
  const roleFilter = sp.rol === "caddie" ? "caddie" : sp.rol === "profesor" ? "profesor" : null;
  const both = user.roles.includes("profesor") && user.roles.includes("caddie");
  const shown = roleFilter ? rows.filter((r) => r.role === roleFilter) : rows;
  const total = shown.reduce((s, r) => s + r.delta, 0);
  const prev = previousPeriod(period, settings.payrollFrequency);
  const next = nextPeriod(period, settings.payrollFrequency);
  const q = (d: string) => `/sesiones?desde=${d}${roleFilter ? `&rol=${roleFilter}` : ""}`;
  return (
    <>
      <PageHeader eyebrow={`Liquidación ${settings.payrollFrequency}`} title="Mis sesiones" />
      <div className="mx-4 mt-3 flex items-center justify-between rounded-[14px] border border-line bg-surface p-1">
        <Link href={q(prev.start)} className="flex h-11 items-center rounded-[10px] bg-bg px-3 text-sm font-medium">Anterior</Link>
        <div className="text-center text-sm font-semibold">
          {fullDate(period.start)} – {fullDate(period.end)}
        </div>
        <Link href={q(next.start)} className="flex h-11 items-center rounded-[10px] bg-bg px-3 text-sm font-medium">Siguiente</Link>
      </div>
      {both && (
        <div className="mx-4 mt-3 grid grid-cols-3 gap-[3px] rounded-[10px] bg-field p-[3px] text-center text-sm">
          {[
            [null, "Todas"],
            ["profesor", "Profesor"],
            ["caddie", "Caddie"],
          ].map(([k, l]) => (
            <Link key={l} href={`/sesiones?desde=${period.start}${k ? `&rol=${k}` : ""}`} className={`flex h-10 items-center justify-center rounded-lg ${roleFilter === k ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}>
              {l}
            </Link>
          ))}
        </div>
      )}
      <div className="mx-4 mt-3 rounded-[14px] border border-line bg-surface px-4 py-4">
        <div className="text-[13px] text-muted">Total de sesiones del período</div>
        <div className="font-mono text-4xl font-semibold">{total}</div>
        {both && !roleFilter && (
          <div className="mt-2 flex gap-4 text-[13px] text-muted">
            <span>
              Como profesor: <strong className="font-mono text-ink">{rows.filter((r) => r.role === "profesor").reduce((s, r) => s + r.delta, 0)}</strong>
            </span>
            <span>
              Como caddie: <strong className="font-mono text-ink">{rows.filter((r) => r.role === "caddie").reduce((s, r) => s + r.delta, 0)}</strong>
            </span>
          </div>
        )}
      </div>
      <SectionTitle>Detalle</SectionTitle>
      {shown.length === 0 ? (
        <Group><Empty>No hay sesiones en este período.</Empty></Group>
      ) : (
        <Group>
          {shown.map((r) => (
            <Row
              key={r.entryId}
              leading={<TimeBlock top={shortDate(r.workDate)} bottom={hhmm(localMinute(r.startsAt))} />}
              title={r.label}
              subtitle={`${r.court} · ${r.role === "caddie" ? "caddie" : "profesor"}${r.source === "correccion" ? " · corrección" : r.source === "caddie_agregado" ? " · agregado después" : ""}`}
              trailing={<span className={`font-mono font-semibold ${r.delta < 0 ? "text-danger" : ""}`}>{r.delta > 0 ? `+${r.delta}` : r.delta}</span>}
            />
          ))}
        </Group>
      )}
    </>
  );
}
