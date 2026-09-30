"use client";

import { useState } from "react";
import { cx } from "@/components/ui";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

type Day = { weekday: number; startMin: number; courtId: number };

function hhmm(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Días del grupo: cada día con su hora y su cancha (D-18). Envía `days` como JSON. */
export function DaysEditor({ weekdayTurns, weekendTurns, courts, defaults = [] }: { weekdayTurns: number[]; weekendTurns: number[]; courts: { id: number; name: string }[]; defaults?: Day[] }) {
  const [days, setDays] = useState<Map<number, Day>>(new Map(defaults.map((d) => [d.weekday, d])));
  const set = (wd: number, patch: Partial<Day> | null) =>
    setDays((m) => {
      const n = new Map(m);
      if (patch === null) n.delete(wd);
      else {
        const turns = wd >= 6 ? weekendTurns : weekdayTurns;
        const cur = n.get(wd) ?? { weekday: wd, startMin: turns[0] ?? 0, courtId: courts[0]?.id ?? 0 };
        n.set(wd, { ...cur, ...patch });
      }
      return n;
    });
  return (
    <div className="space-y-2">
      <input type="hidden" name="days" value={JSON.stringify([...days.values()].sort((a, b) => a.weekday - b.weekday))} />
      {DAYS.map((label, i) => {
        const wd = i + 1;
        const d = days.get(wd);
        const turns = wd >= 6 ? weekendTurns : weekdayTurns;
        return (
          <div key={wd} className={cx("rounded-xl border px-3 py-2", d ? "border-brand bg-brand-soft/50" : "border-line")}>
            <label className="flex min-h-10 cursor-pointer items-center gap-2.5">
              <input type="checkbox" checked={Boolean(d)} onChange={(e) => set(wd, e.target.checked ? {} : null)} className="h-4 w-4 accent-[#1f7a4d]" disabled={turns.length === 0} />
              <span className="text-sm font-semibold">{label}</span>
              {turns.length === 0 && <span className="text-xs text-muted">sin franjas</span>}
            </label>
            {d && (
              <div className="mt-1 grid grid-cols-2 gap-2 pb-1">
                <select aria-label={`Hora del ${label}`} value={d.startMin} onChange={(e) => set(wd, { startMin: Number(e.target.value) })} className="h-11 rounded-lg border border-line bg-surface px-2 font-mono text-sm">
                  {turns.map((t) => (
                    <option key={t} value={t}>
                      {hhmm(t)}
                    </option>
                  ))}
                </select>
                <select aria-label={`Cancha del ${label}`} value={d.courtId} onChange={(e) => set(wd, { courtId: Number(e.target.value) })} className="h-11 rounded-lg border border-line bg-surface px-2 text-sm">
                  {courts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
