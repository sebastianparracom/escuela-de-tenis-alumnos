"use client";

import { useMemo, useState } from "react";
import { Icon } from "./icons";
import { inputClass } from "./ui";

export type PickOption = { value: string; label: string; hint?: string };

/** Lista con buscador para escoger una persona (p. ej. el alumno de la clase, CA-14). */
export function SearchPicker({ name, options, placeholder = "Buscar por nombre", required, defaultValue }: { name: string; options: PickOption[]; placeholder?: string; required?: boolean; defaultValue?: string }) {
  const [q, setQ] = useState("");
  const [value, setValue] = useState(defaultValue ?? "");
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const list = useMemo(() => {
    const n = norm(q.trim());
    return n ? options.filter((o) => norm(o.label).includes(n)) : options;
  }, [q, options]);
  const selected = options.find((o) => o.value === value);
  return (
    <div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={inputClass} aria-label={placeholder} />
      {selected && (
        <p className="mt-2 text-[13px] text-brand-dark">
          Escogido: <strong>{selected.label}</strong>
        </p>
      )}
      <div role="radiogroup" className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-line [&>*+*]:border-t [&>*+*]:border-line-soft">
        {list.length === 0 && <p className="px-3.5 py-4 text-sm text-muted">Sin resultados.</p>}
        {list.map((o) => (
          <label key={o.value} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3.5 py-2 has-[:checked]:bg-brand-soft">
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium">{o.label}</span>
              {o.hint && <span className="block text-xs text-muted">{o.hint}</span>}
            </span>
            <input type="radio" aria-label={o.label} name={name} value={o.value} checked={value === o.value} onChange={() => setValue(o.value)} required={required} className="sr-only" />
            {value === o.value && (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                <Icon name="check" size={14} strokeWidth={3} />
              </span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
