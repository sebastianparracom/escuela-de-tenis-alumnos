"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "@/components/forms";
import { Icon } from "@/components/icons";
import { Field, Select, Textarea, cx } from "@/components/ui";

type Person = { id: string; fullName: string };
type Participant = { childId: string; fullName: string; isGuest: boolean; present: boolean | null };

/**
 * Cierre (CA-31 a CA-36) o corrección (CA-37) de una clase o un alquiler.
 * Muestra asistencia por niño en las clases de grupo y el caddie opcional.
 */
export function ClosureForm({
  mode,
  kind,
  action,
  caddies,
  reasons,
  participants = [],
  defaultCaddieId,
  defaultPositive = true,
  defaultReasonId,
  canBePositive,
  profesorName,
}: {
  mode: "close" | "correct";
  kind: "individual" | "grupal" | "alquiler";
  action: FormAction;
  caddies: Person[];
  reasons: { id: number; label: string }[];
  participants?: Participant[];
  defaultCaddieId?: string | null;
  defaultPositive?: boolean;
  defaultReasonId?: number | null;
  canBePositive: boolean;
  profesorName?: string | null;
}) {
  const rental = kind === "alquiler";
  const [positive, setPositive] = useState(canBePositive ? defaultPositive : false);
  const [present, setPresent] = useState<Set<string>>(
    new Set(participants.filter((p) => (mode === "correct" ? p.present : true)).map((p) => p.childId)),
  );
  const [caddie, setCaddie] = useState(defaultCaddieId ?? "");
  const labels = rental ? (["Usado", "No usado"] as const) : (["Dictada", "Cancelada"] as const);
  const values = rental ? (["usado", "no_usado"] as const) : (["dictada", "cancelada"] as const);
  const caddieName = caddies.find((c) => c.id === caddie)?.fullName;

  const toggle = (id: string) =>
    setPresent((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  let summary = "";
  if (positive) {
    if (kind === "individual") summary = `Se descuenta 1 clase de la bolsa individual del alumno. ${profesorName ?? "El profesor"} suma 1 sesión${caddieName ? ` y ${caddieName} 1 sesión` : ""}.`;
    if (kind === "grupal") summary = `Se descuenta 1 clase grupal a ${present.size === 1 ? "1 presente" : `los ${present.size} presentes`}. ${profesorName ?? "El profesor"} suma 1 sesión${caddieName ? ` y ${caddieName} 1 sesión` : ""}.`;
    if (kind === "alquiler") summary = caddieName ? `${caddieName} suma 1 sesión por cada turno y se cobra el recargo por caddie.` : "Se cobra el alquiler por turno según su franja.";
  } else {
    summary = rental ? "No se cobra y nadie suma sesiones." : "No descuenta clases ni suma sesiones.";
  }
  if (mode === "correct") summary = `Al guardar, el sistema ajusta bolsas y sesiones. ${summary}`;

  return (
    <ActionForm action={action}>
      <input type="hidden" name={mode === "close" ? "outcome" : "status"} value={positive ? values[0] : values[1]} />
      <div role="group" aria-label="Resultado" className="grid grid-cols-2 gap-[3px] rounded-[10px] bg-field p-[3px]">
        {labels.map((l, i) => {
          const on = i === 0 ? positive : !positive;
          const disabled = i === 0 && !canBePositive;
          return (
            <button
              key={l}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => setPositive(i === 0)}
              className={cx("h-10 rounded-lg text-sm", on ? "bg-surface font-semibold shadow-sm" : "font-medium text-muted", disabled && "opacity-40")}
            >
              {l}
            </button>
          );
        })}
      </div>
      {!canBePositive && <p className="text-xs text-muted">Solo se puede marcar como {labels[0].toLowerCase()} desde su hora de inicio.</p>}

      {positive && kind === "grupal" && (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-ink-2">Asistencia</span>
            <span className="font-mono text-xs text-muted">
              {present.size} / {participants.length}
            </span>
          </div>
          {participants.length === 0 ? (
            <p className="text-sm text-muted">El grupo no tiene niños inscritos para este día.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line [&>*+*]:border-t [&>*+*]:border-line-soft">
              {participants.map((p) => {
                const on = present.has(p.childId);
                return (
                  <label key={p.childId} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3.5">
                    <span className={cx("text-[15px]", on ? "font-medium" : "text-muted")}>
                      {p.fullName}
                      {p.isGuest && <span className="ml-2 text-xs text-muted">invitado</span>}
                    </span>
                    <input type="checkbox" name="present" value={p.childId} checked={on} onChange={() => toggle(p.childId)} className="sr-only" />
                    {on ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white">
                        <Icon name="check" size={14} strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-muted">Ausente</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {positive && (
        <Field label={rental ? "¿Hubo caddie?" : "Caddie (opcional)"} hint={kind === "grupal" ? "Máximo un caddie por clase grupal." : undefined}>
          <Select name="caddieId" value={caddie} onChange={(e) => setCaddie(e.target.value)}>
            <option value="">Sin caddie</option>
            {caddies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {!positive && (
        <Field label="Motivo">
          <Select name="reasonId" required defaultValue={defaultReasonId ? String(defaultReasonId) : ""}>
            <option value="" disabled>
              Escoge un motivo
            </option>
            {reasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {mode === "correct" && (
        <Field label="Motivo de la corrección" hint="Queda registrado quién hizo el cambio y por qué.">
          <Textarea name="why" required rows={2} />
        </Field>
      )}

      <p className="text-xs leading-snug text-muted">{summary}</p>
      <SubmitButton variant={mode === "correct" ? "secondary" : "primary"}>
        {mode === "correct" ? "Guardar corrección" : positive ? `Cerrar como ${labels[0].toLowerCase()}` : rental ? "Cerrar como no usado" : "Cancelar clase"}
      </SubmitButton>
    </ActionForm>
  );
}
