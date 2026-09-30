import { eq } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/forms";
import { SearchChecklist } from "@/components/checklist";
import { Field, FormCard, Input, Notice, PageHeader, Select } from "@/components/ui";
import { children } from "@/db/schema";
import { localDate } from "@/lib/time";
import { listCourts } from "@/server/config";
import { turnStartsAt } from "@/server/groups";
import { usersWithRole } from "@/server/people";
import { ctxOf, requireUser } from "@/server/session";
import { createGroupAction } from "../actions";
import { DaysEditor } from "../days-editor";

export const metadata = { title: "Nuevo grupo" };

/** CA-17: nombre, profesor, cancha, días, turno fijo y niños inscritos (solo niños). */
export default async function NuevoGrupoPage() {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const today = localDate(ctx.now);
  const [profesores, courts, turns, kids] = await Promise.all([
    usersWithRole(ctx.db, "profesor"),
    listCourts(ctx.db, true),
    turnStartsAt(ctx.db, today),
    ctx.db.select({ id: children.id, fullName: children.fullName }).from(children).where(eq(children.isActive, true)),
  ]);
  return (
    <>
      <PageHeader back={{ href: "/grupos", label: "Grupos" }} title="Nuevo grupo" />
      {turns.weekday.length + turns.weekend.length === 0 && <div className="mt-2"><Notice tone="red">Primero configura las franjas en Configuración.</Notice></div>}
      <div className="mt-3">
        <FormCard>
          <ActionForm action={createGroupAction}>
            <div className="grid grid-cols-[1fr_96px] gap-3">
              <Field label="Nombre">
                <Input name="name" required placeholder="Ej. Sub-10" />
              </Field>
              <Field label="Código">
                <Input name="code" required maxLength={5} placeholder="S10" className="uppercase" />
              </Field>
            </div>
            <p className="-mt-2 text-xs text-muted">El código se ve en las celdas del tablero.</p>
            <Field label="Profesor">
              <Select name="profesorId" required defaultValue="">
                <option value="" disabled>Escoge el profesor</option>
                {profesores.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inicio">
                <Input type="date" name="startDate" defaultValue={today} required />
              </Field>
              <Field label="Fin (opcional)">
                <Input type="date" name="endDate" />
              </Field>
            </div>
            <Field label="Cupo (opcional)">
              <Input name="capacity" type="number" min={1} placeholder="Ej. 10" />
            </Field>
            <Field label="Días, hora y cancha" hint="En festivos no hay clase de grupo.">
              <DaysEditor weekdayTurns={turns.weekday} weekendTurns={turns.weekend} courts={courts} />
            </Field>
            <Field label="Niños inscritos">
              <SearchChecklist name="children" options={kids.map((k) => ({ value: k.id, label: k.fullName }))} />
            </Field>
            <SubmitButton>Crear grupo</SubmitButton>
          </ActionForm>
        </FormCard>
      </div>
    </>
  );
}
