import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Empty, Group, Notice, PageHeader, Row, SectionTitle } from "@/components/ui";
import { fullDate, money, shortDate } from "@/lib/format";
import { nextPeriod, periodFor, previousPeriod } from "@/lib/periods";
import { isValidDate, localDate } from "@/lib/time";
import { getSettings } from "@/server/config";
import { paidPayrolls, payrollPreview } from "@/server/payroll";
import { ctxOf, requireUser } from "@/server/session";
import { payAction } from "./actions";

export const metadata = { title: "Liquidación" };

/** CA-50 y CA-51: sesiones por persona, detalle y valor a pagar; el administrador la marca como pagada. */
export default async function LiquidacionPage({ searchParams }: PageProps<"/liquidacion">) {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const sp = await searchParams;
  const settings = await getSettings(ctx.db);
  const today = localDate(ctx.now);
  const ref = typeof sp.desde === "string" && isValidDate(sp.desde) ? sp.desde : previousPeriod(periodFor(today, settings.payrollFrequency), settings.payrollFrequency).start;
  const period = periodFor(ref, settings.payrollFrequency);
  const [lines, paid] = await Promise.all([payrollPreview(ctx.db, period), paidPayrolls(ctx.db, period)]);
  const prev = previousPeriod(period, settings.payrollFrequency);
  const next = nextPeriod(period, settings.payrollFrequency);
  const open = period.end >= today;
  return (
    <>
      <PageHeader eyebrow={`Frecuencia ${settings.payrollFrequency} · se cambia en Configuración`} title="Liquidación" />
      <div className="mx-4 mt-3 flex items-center justify-between rounded-[14px] border border-line bg-surface p-1">
        <Link href={`/liquidacion?desde=${prev.start}`} className="flex h-11 items-center rounded-[10px] bg-bg px-3 text-sm font-medium">Anterior</Link>
        <div className="text-center text-sm font-semibold">{fullDate(period.start)} – {fullDate(period.end)}</div>
        <Link href={`/liquidacion?desde=${next.start}`} className="flex h-11 items-center rounded-[10px] bg-bg px-3 text-sm font-medium">Siguiente</Link>
      </div>
      {open && <div className="mt-3"><Notice>Este período todavía no termina: las sesiones pueden cambiar.</Notice></div>}
      <SectionTitle>Por pagar</SectionTitle>
      {lines.length === 0 ? (
        <Group><Empty>No hay sesiones pendientes hasta el {fullDate(period.end)}.</Empty></Group>
      ) : (
        <div className="space-y-3">
          {lines.map((l) => (
            <div key={l.personId} className="mx-4 overflow-hidden rounded-[14px] border border-line bg-surface">
              <div className="flex items-center gap-3 px-3.5 pt-3">
                <div className="min-w-0 flex-1 text-[15px] font-semibold">{l.name}</div>
                <div className="font-mono text-lg font-semibold">{l.amount != null ? money(l.amount) : "—"}</div>
              </div>
              <div className="space-y-1 px-3.5 pt-1 pb-3">
                {l.parts.map((p) => (
                  <div key={p.role} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="text-muted">
                      {p.sessions} {p.sessions === 1 ? "sesión" : "sesiones"} como {p.role} × {p.rate != null ? money(p.rate) : <span className="text-danger">sin valor</span>}
                      {p.adjustments !== 0 ? ` · incluye ${p.adjustments > 0 ? "+" : ""}${p.adjustments} de períodos anteriores` : ""}
                    </span>
                    <span className="font-mono">{p.amount != null ? money(p.amount) : "—"}</span>
                  </div>
                ))}
              </div>
              <details className="border-t border-line-soft">
                <summary className="flex min-h-11 cursor-pointer list-none items-center px-3.5 text-[13px] font-semibold text-brand">Ver detalle de las {l.entries.length} sesiones</summary>
                <div className="[&>*+*]:border-t [&>*+*]:border-line-soft">
                  {l.entries.map((e) => (
                    <div key={e.entryId} className="flex items-center gap-3 px-3.5 py-2 text-[13px]">
                      <span className="w-20 shrink-0 font-mono text-muted">{shortDate(e.workDate)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {e.label} · {e.court} · {e.role}
                        {e.workDate < period.start ? " · período anterior" : ""}
                      </span>
                      <span className={`font-mono font-semibold ${e.delta < 0 ? "text-danger" : ""}`}>{e.delta > 0 ? `+${e.delta}` : e.delta}</span>
                    </div>
                  ))}
                </div>
              </details>
              <div className="border-t border-line-soft p-3">
                {l.amount == null ? (
                  <p className="text-xs text-danger">Define en Personas el valor por sesión de cada rol que tenga para poder liquidar.</p>
                ) : (
                  <ActionForm action={payAction.bind(null, l.personId, period.start, period.end)} confirm={`¿Marcar como pagada la liquidación de ${l.name} por ${money(l.amount)}?`}>
                    <SubmitButton size="md" variant="secondary">Marcar como pagada</SubmitButton>
                  </ActionForm>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {paid.length > 0 && (
        <>
          <SectionTitle>Pagadas en este período</SectionTitle>
          <Group>
            {paid.map((p) => (
              <Row key={p.id} title={p.name} subtitle={`${p.role === "profesor" ? "Profesor" : "Caddie"} · ${p.sessions} sesiones × ${money(p.rate)} · ${p.paidAt.toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}`} trailing={<span className="font-mono font-semibold">{money(p.amount)}</span>} />
            ))}
          </Group>
        </>
      )}
    </>
  );
}
