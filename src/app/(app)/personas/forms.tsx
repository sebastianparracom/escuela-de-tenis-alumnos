import { ActionForm, SubmitButton, type FormAction } from "@/components/forms";
import { SearchChecklist } from "@/components/checklist";
import { Field, Input, Textarea } from "@/components/ui";
import { ROLE_LABEL, ROLES } from "@/server/people";
import type { Role } from "@/server/context";

type UserDefaults = { fullName?: string; email?: string; phone?: string; document?: string | null; roles?: Role[]; profesorRate?: number | null; caddieRate?: number | null };

export function UserForm({ action, defaults = {}, isNew }: { action: FormAction; defaults?: UserDefaults; isNew: boolean }) {
  return (
    <ActionForm action={action}>
      <Field label="Nombre completo">
        <Input name="fullName" defaultValue={defaults.fullName} required autoComplete="off" />
      </Field>
      <Field label="Correo" hint="Con este correo entra a la aplicación.">
        <Input type="email" name="email" defaultValue={defaults.email} required autoComplete="off" />
      </Field>
      <Field label="Teléfono">
        <Input type="tel" name="phone" defaultValue={defaults.phone} inputMode="tel" />
      </Field>
      <Field label="Documento (opcional)">
        <Input name="document" defaultValue={defaults.document ?? ""} />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">Roles</legend>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((r) => (
            <label key={r} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-line px-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="checkbox" name="roles" value={r} defaultChecked={defaults.roles?.includes(r)} className="h-4 w-4 accent-[#1f7a4d]" />
              <span className="text-sm font-medium">{ROLE_LABEL[r]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor por sesión como profesor">
          <Input name="profesorRate" inputMode="numeric" defaultValue={defaults.profesorRate ?? ""} placeholder="Ej. 30000" />
        </Field>
        <Field label="Valor por sesión como caddie">
          <Input name="caddieRate" inputMode="numeric" defaultValue={defaults.caddieRate ?? ""} placeholder="Ej. 20000" />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted">En pesos. Llena el del rol o los roles que tenga. No cambia con la duración del turno ni con el tipo de sesión.</p>
      <Field label="Foto de perfil (opcional)">
        <input type="file" name="photo" accept="image/*" className="block w-full text-sm file:mr-3 file:h-10 file:rounded-lg file:border-0 file:bg-field file:px-3 file:font-semibold" />
      </Field>
      {isNew && (
        <Field label="Contraseña temporal" hint="Mínimo 8 caracteres. El usuario la cambiará al entrar por primera vez.">
          <Input name="password" type="text" minLength={8} required autoComplete="off" />
        </Field>
      )}
      <SubmitButton>{isNew ? "Crear usuario" : "Guardar cambios"}</SubmitButton>
    </ActionForm>
  );
}

type ChildDefaults = { fullName?: string; birthDate?: string | null; emergencyName?: string; emergencyPhone?: string; notes?: string | null; guardianIds?: string[] };

export function ChildForm({ action, defaults = {}, clients, isNew }: { action: FormAction; defaults?: ChildDefaults; clients: { id: string; fullName: string }[]; isNew: boolean }) {
  return (
    <ActionForm action={action}>
      <Field label="Nombre completo">
        <Input name="fullName" defaultValue={defaults.fullName} required autoComplete="off" />
      </Field>
      <Field label="Fecha de nacimiento (opcional)">
        <Input type="date" name="birthDate" defaultValue={defaults.birthDate ?? ""} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Contacto de emergencia">
          <Input name="emergencyName" defaultValue={defaults.emergencyName} placeholder="Nombre" required />
        </Field>
        <Field label="Teléfono de emergencia">
          <Input type="tel" name="emergencyPhone" defaultValue={defaults.emergencyPhone} inputMode="tel" required />
        </Field>
      </div>
      <Field label="A cargo de" hint="Uno o varios clientes. Todos ven la misma información del niño.">
        <SearchChecklist name="guardians" options={clients.map((c) => ({ value: c.id, label: c.fullName }))} defaultValues={defaults.guardianIds} />
      </Field>
      <Field label="Notas (opcional)">
        <Textarea name="notes" defaultValue={defaults.notes ?? ""} rows={2} />
      </Field>
      <Field label="Foto (opcional)">
        <input type="file" name="photo" accept="image/*" className="block w-full text-sm file:mr-3 file:h-10 file:rounded-lg file:border-0 file:bg-field file:px-3 file:font-semibold" />
      </Field>
      <SubmitButton>{isNew ? "Crear niño" : "Guardar cambios"}</SubmitButton>
    </ActionForm>
  );
}
