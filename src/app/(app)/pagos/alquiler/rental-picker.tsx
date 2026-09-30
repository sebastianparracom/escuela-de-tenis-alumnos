"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

const cop = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function RentalPicker({ rentals }: { rentals: { id: string; label: string; detail: string; outstanding: number }[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set(rentals.map((r) => r.id)));
  const total = rentals.filter((r) => sel.has(r.id)).reduce((s, r) => s + r.outstanding, 0);
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-line [&>*+*]:border-t [&>*+*]:border-line-soft">
        {rentals.map((r) => {
          const on = sel.has(r.id);
          return (
            <label key={r.id} className="flex min-h-14 cursor-pointer items-center gap-3 px-3.5 py-2">
              <input
                type="checkbox"
                name="bookingIds"
                value={r.id}
                checked={on}
                onChange={() =>
                  setSel((s) => {
                    const n = new Set(s);
                    if (n.has(r.id)) n.delete(r.id);
                    else n.add(r.id);
                    return n;
                  })
                }
                className="sr-only"
              />
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${on ? "border-brand bg-brand text-white" : "border-line"}`}>
                {on && <Icon name="check" size={14} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{r.label}</span>
                <span className="block text-xs text-muted">{r.detail}</span>
              </span>
              <span className="font-mono text-sm font-semibold">${cop.format(r.outstanding)}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-baseline justify-between rounded-xl bg-field px-3.5 py-3">
        <span className="text-sm font-semibold">Total a registrar</span>
        <span className="font-mono text-lg font-semibold">${cop.format(total)}</span>
      </div>
    </div>
  );
}
