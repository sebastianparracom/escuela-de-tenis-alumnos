"use client";

import { useMemo, useState } from "react";
import { Icon } from "./icons";
import { inputClass } from "./ui";

/** Selección múltiple con buscador (clientes a cargo de un niño, niños de un grupo). */
export function SearchChecklist({ name, options, defaultValues = [], max }: { name: string; options: { value: string; label: string }[]; defaultValues?: string[]; max?: number }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set(defaultValues));
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const list = useMemo(() => {
    const n = norm(q.trim());
    const filtered = n ? options.filter((o) => norm(o.label).includes(n)) : options;
    return [...filtered].sort((a, b) => Number(sel.has(b.value)) - Number(sel.has(a.value)));
  }, [q, options, sel]);
  const toggle = (v: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v);
      else if (!max || n.size < max) n.add(v);
      return n;
    });
  return (
    <div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar por nombre" className={inputClass} />
      <p className="mt-2 text-xs text-muted">
        {sel.size} escogido{sel.size === 1 ? "" : "s"}
        {max ? ` de ${max}` : ""}
      </p>
      <div className="mt-1 max-h-64 overflow-y-auto rounded-xl border border-line [&>*+*]:border-t [&>*+*]:border-line-soft">
        {list.length === 0 && <p className="px-3.5 py-4 text-sm text-muted">Sin resultados.</p>}
        {list.map((o) => {
          const on = sel.has(o.value);
          return (
            <label key={o.value} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3.5">
              <span className={`text-[15px] ${on ? "font-semibold" : ""}`}>{o.label}</span>
              <input type="checkbox" aria-label={o.label} name={name} value={o.value} checked={on} onChange={() => toggle(o.value)} className="sr-only" />
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${on ? "border-brand bg-brand text-white" : "border-line"}`}>
                {on && <Icon name="check" size={14} strokeWidth={3} />}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
