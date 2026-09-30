"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { cx, inputClass } from "@/components/ui";

type Cal = "entre_semana" | "fin_de_semana";
type Band = { calendar: Cal; startMin: number; endMin: number; turnMinutes: number; isNight: boolean };
const MAX_END = 23 * 60 + 59;

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const parse = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};

function suggest(b: Band) {
  const span = b.endMin - b.startMin;
  if (span <= 0) return [];
  const lo = b.startMin + Math.floor(span / b.turnMinutes) * b.turnMinutes;
  const hi = b.startMin + Math.ceil(span / b.turnMinutes) * b.turnMinutes;
  return [lo, hi].filter((v, i, a) => v > b.startMin && v <= MAX_END && a.indexOf(v) === i);
}

/** Editor de franjas con vista previa de turnos y sugerencia de fin exacto (D-42). */
export function BandsEditor({ initial }: { initial: Band[] }) {
  const [bands, setBands] = useState<Band[]>(initial);
  const update = (i: number, patch: Partial<Band>) => setBands((bs) => bs.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  const add = (calendar: Cal) =>
    setBands((bs) => {
      const last = bs.filter((b) => b.calendar === calendar).sort((a, b) => a.startMin - b.startMin).at(-1);
      const start = last ? last.endMin : 6 * 60;
      return [...bs, { calendar, startMin: start, endMin: Math.min(start + 4 * 60, MAX_END), turnMinutes: 60, isNight: start >= 18 * 60 }];
    });
  const remove = (i: number) => setBands((bs) => bs.filter((_, k) => k !== i));

  return (
    <div className="space-y-5">
      <input type="hidden" name="bands" value={JSON.stringify(bands)} />
      {(["entre_semana", "fin_de_semana"] as const).map((cal) => {
        const items = bands.map((b, i) => ({ b, i })).filter((x) => x.b.calendar === cal).sort((a, b) => a.b.startMin - b.b.startMin);
        return (
          <div key={cal}>
            <h3 className="mb-2 text-sm font-semibold">{cal === "entre_semana" ? "Entre semana (lunes a viernes)" : "Fin de semana y festivos"}</h3>
            <div className="space-y-2">
              {items.map(({ b, i }) => {
                const exact = b.endMin > b.startMin && (b.endMin - b.startMin) % b.turnMinutes === 0;
                const n = exact ? (b.endMin - b.startMin) / b.turnMinutes : 0;
                const turns = exact ? Array.from({ length: n }, (_, k) => b.startMin + k * b.turnMinutes) : [];
                return (
                  <div key={i} className={cx("rounded-xl border p-3", exact ? "border-line" : "border-danger")}>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-semibold text-muted">
                        Inicio
                        <input type="time" step={300} value={hhmm(b.startMin)} onChange={(e) => update(i, { startMin: parse(e.target.value) })} className={cx(inputClass, "mt-1 h-11 font-mono")} />
                      </label>
                      <label className="text-xs font-semibold text-muted">
                        Fin
                        <input type="time" step={300} value={hhmm(b.endMin)} onChange={(e) => update(i, { endMin: parse(e.target.value) })} className={cx(inputClass, "mt-1 h-11 font-mono")} />
                      </label>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div role="group" aria-label="Duración del turno" className="grid grid-cols-2 gap-[3px] rounded-[10px] bg-field p-[3px]">
                        {[45, 60].map((m) => (
                          <button key={m} type="button" aria-pressed={b.turnMinutes === m} onClick={() => update(i, { turnMinutes: m })} className={cx("h-9 rounded-lg text-sm", b.turnMinutes === m ? "bg-surface font-semibold shadow-sm" : "text-muted")}>
                            {m} min
                          </button>
                        ))}
                      </div>
                      <div role="group" aria-label="Tipo de franja" className="grid grid-cols-2 gap-[3px] rounded-[10px] bg-field p-[3px]">
                        {[false, true].map((night) => (
                          <button key={String(night)} type="button" aria-pressed={b.isNight === night} onClick={() => update(i, { isNight: night })} className={cx("h-9 rounded-lg text-sm", b.isNight === night ? "bg-surface font-semibold shadow-sm" : "text-muted")}>
                            {night ? "Nocturna" : "Diurna"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {exact ? (
                      <p className="mt-2 text-xs text-muted">
                        {n} turno{n === 1 ? "" : "s"}: <span className="font-mono">{turns.map(hhmm).join(", ")}</span>
                      </p>
                    ) : (
                      <div className="mt-2 text-xs text-danger">
                        No da turnos exactos de {b.turnMinutes} minutos.
                        {suggest(b).length > 0 && (
                          <span className="mt-1.5 flex flex-wrap gap-2">
                            {suggest(b).map((v) => (
                              <button key={v} type="button" onClick={() => update(i, { endMin: v })} className="h-8 rounded-lg bg-danger-soft px-2.5 font-semibold">
                                Terminar a las {hhmm(v)} ({(v - b.startMin) / b.turnMinutes} turnos)
                              </button>
                            ))}
                          </span>
                        )}
                      </div>
                    )}
                    <button type="button" onClick={() => remove(i)} className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-danger">
                      <Icon name="x" size={14} strokeWidth={2.4} /> Quitar franja
                    </button>
                  </div>
                );
              })}
              <button type="button" onClick={() => add(cal)} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-sm font-semibold text-brand">
                <Icon name="plus" size={16} strokeWidth={2.2} /> Agregar franja
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
