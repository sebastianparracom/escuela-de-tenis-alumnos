"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";

type Pkg = { id: number; name: string; kind: "individual" | "grupal"; classCount: number; price: number };
type Prices = { individualDay: number; individualNight: number; groupSingle: number } | null;

const cop = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** Qué compra y valor sugerido, editable por el administrador (D-27). */
export function PurchaseFields({ packages, prices, allowGroup }: { packages: Pkg[]; prices: Prices; allowGroup: boolean }) {
  const [what, setWhat] = useState("");
  const [qty, setQty] = useState(1);
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);

  const suggest = (w: string, q: number) => {
    if (w.startsWith("pkg:")) return packages.find((p) => `pkg:${p.id}` === w)?.price ?? null;
    if (!prices) return null;
    if (w === "suelta:individual_diurna") return prices.individualDay * q;
    if (w === "suelta:individual_nocturna") return prices.individualNight * q;
    if (w === "suelta:grupal") return prices.groupSingle * q;
    return null;
  };
  const update = (w: string, q: number) => {
    const s = suggest(w, q);
    if (!touched && s !== null) setAmount(String(s));
  };
  const loose = what.startsWith("suelta:");
  const visible = packages.filter((p) => allowGroup || p.kind === "individual");
  const suggested = suggest(what, qty);

  return (
    <>
      <Field label="Qué compra" hint={allowGroup ? undefined : "Las clases grupales solo se compran para niños."}>
        <Select
          name="what"
          required
          value={what}
          onChange={(e) => {
            setWhat(e.target.value);
            update(e.target.value, qty);
          }}
        >
          <option value="" disabled>
            Escoge un paquete o clases sueltas
          </option>
          <optgroup label="Paquetes">
            {visible.map((p) => (
              <option key={p.id} value={`pkg:${p.id}`}>
                {p.name} · {p.classCount} {p.kind === "grupal" ? "grupales" : "individuales"}
              </option>
            ))}
          </optgroup>
          <optgroup label="Clases sueltas">
            <option value="suelta:individual_diurna">Individual diurna</option>
            <option value="suelta:individual_nocturna">Individual nocturna</option>
            {allowGroup && <option value="suelta:grupal">Grupal</option>}
          </optgroup>
        </Select>
      </Field>
      {loose && (
        <Field label="Cantidad de clases">
          <Input
            name="quantity"
            type="number"
            min={1}
            max={100}
            value={qty}
            onChange={(e) => {
              const q = Math.max(1, Number(e.target.value) || 1);
              setQty(q);
              update(what, q);
            }}
            required
          />
        </Field>
      )}
      <Field label="Valor pagado (COP)" hint={suggested !== null ? `Valor sugerido: $${cop.format(suggested)}. Puedes cambiarlo (descuentos).` : "Escribe el valor pagado."}>
        <Input
          name="amount"
          inputMode="numeric"
          required
          value={amount}
          onChange={(e) => {
            setTouched(true);
            setAmount(e.target.value.replace(/[^\d]/g, ""));
          }}
        />
      </Field>
    </>
  );
}
