import Link from "next/link";
import type { AgendaDay } from "@/server/queries";
import { hhmm } from "@/lib/time";
import { cx } from "./ui";

const CELL: Record<string, string> = {
  libre: "border border-line bg-surface",
  individual: "bg-cell-ind text-white",
  grupal: "border border-cell-grp-line bg-cell-grp text-info-ink",
  alquiler: "bg-cell-alq text-cell-alq-ink",
  ocupado: "bg-field text-muted",
};

export function BoardLegend({ client = false }: { client?: boolean }) {
  const items = client
    ? [
        ["libre", "Libre"],
        ["ocupado", "Ocupado"],
        ["alquiler", "Tu reserva"],
      ]
    : [
        ["libre", "Libre"],
        ["individual", "Individual"],
        ["grupal", "Grupal"],
        ["alquiler", "Alquiler"],
      ];
  return (
    <div className="flex flex-wrap gap-3.5 px-4 pt-3.5 pb-2.5 text-xs font-medium">
      {items.map(([k, l]) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className={cx("h-3.5 w-3.5 rounded", CELL[k])} />
          {l}
        </span>
      ))}
    </div>
  );
}

/**
 * Tablero por cancha y turno (CA-13, CA-52). `freeHref` arma el enlace para reservar un turno libre;
 * sin él, los libres no son clicables.
 */
export function Board({ day, freeHref, pastBefore }: { day: AgendaDay; freeHref?: (courtId: number, startMin: number) => string | null; pastBefore?: number }) {
  if (day.turns.length === 0) {
    return <div className="mx-4 rounded-[14px] border border-line bg-surface px-4 py-8 text-center text-sm text-muted">No hay franjas configuradas para este día.</div>;
  }
  const cols = { gridTemplateColumns: `42px repeat(${day.courts.length}, minmax(0, 1fr))` };
  return (
    <div className="mx-4 rounded-[14px] border border-line bg-surface p-2">
      <div className="grid gap-[3px] pb-0.5 text-center text-[11px] font-semibold text-muted" style={cols}>
        <span />
        {day.courts.map((c) => (
          <span key={c.id} title={c.name}>
            {shortCourt(c.name)}
          </span>
        ))}
      </div>
      {day.turns.map((t, ti) => (
        <div key={t.startMin}>
          {t.isNight && (ti === 0 || !day.turns[ti - 1].isNight) && (
            <div className="mt-1.5 mb-0.5 flex items-center gap-2 text-[11px] font-semibold text-muted">
              <span>Nocturna</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          )}
          <div className="mt-[3px] grid gap-[3px]" style={cols}>
            <div className="flex items-center font-mono text-xs font-medium text-ink-2">{hhmm(t.startMin)}</div>
            {day.cells[ti].map((cell, ci) => {
              const court = day.courts[ci];
              const cls = cx("flex h-10 items-center justify-center rounded-md text-[11px] font-semibold", CELL[cell.state]);
              const aria = `${court.name}, ${hhmm(t.startMin)}: ${cell.state === "libre" ? "libre" : cell.state}${cell.label ? ` ${cell.label}` : ""}`;
              if (cell.bookingId) {
                return (
                  <Link key={ci} href={`/reservas/${cell.bookingId}`} aria-label={aria} className={cx(cls, "ring-offset-1 active:ring-2 active:ring-brand")}>
                    {cell.label}
                  </Link>
                );
              }
              const past = pastBefore !== undefined && t.startMin < pastBefore;
              const href = cell.state === "libre" && freeHref && !past ? freeHref(court.id, t.startMin) : null;
              if (href) {
                return (
                  <Link key={ci} href={href} aria-label={`Reservar ${aria}`} className={cx(cls, "active:bg-brand-soft")}>
                    {cell.label}
                  </Link>
                );
              }
              return (
                <div key={ci} aria-label={aria} className={cx(cls, past && cell.state === "libre" && "bg-bg")}>
                  {cell.label}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function shortCourt(name: string) {
  const m = /(\d+)\s*$/.exec(name);
  return m ? `C${m[1]}` : name.slice(0, 3);
}
