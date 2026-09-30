"use client";

import { useState, type ReactNode } from "react";

export function KindSwitch({ classForm, rentalForm }: { classForm: ReactNode; rentalForm: ReactNode }) {
  const [kind, setKind] = useState<"clase" | "alquiler">("clase");
  return (
    <>
      <div role="group" aria-label="Tipo de reserva" className="mx-4 mb-4 grid grid-cols-2 gap-[3px] rounded-[10px] bg-field p-[3px]">
        {(["clase", "alquiler"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={`h-10 rounded-lg text-sm ${kind === k ? "bg-surface font-semibold shadow-sm" : "font-medium text-muted"}`}
          >
            {k === "clase" ? "Clase individual" : "Alquiler"}
          </button>
        ))}
      </div>
      {kind === "clase" ? classForm : rentalForm}
    </>
  );
}
