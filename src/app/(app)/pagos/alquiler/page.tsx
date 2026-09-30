import { ActionForm, SubmitButton } from "@/components/forms";
import { SearchPicker } from "@/components/picker";
import { Field, FormCard, Input, Notice, PageHeader, Select } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/labels";
import { hhmm, localDate, localMinute } from "@/lib/time";
import { usersWithRole } from "@/server/people";
import { clientRentals } from "@/server/queries";
import { ctxOf, requireUser } from "@/server/session";
import { rentalPaymentAction } from "../actions";
import { RentalPicker } from "./rental-picker";

export const metadata = { title: "Pago de alquiler" };

/** CA-27 y D-28: el pago va contra la reserva, sin abonos, y puede cubrir varios alquileres. */
export default async function PagoAlquilerPage({ searchParams }: PageProps<"/pagos/alquiler">) {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const sp = await searchParams;
  const payerId = typeof sp.cliente === "string" ? sp.cliente : null;
  const clients = await usersWithRole(ctx.db, "cliente");
  const payer = clients.find((c) => c.id === payerId);
  const header = <PageHeader back={{ href: "/pagos", label: "Pagos" }} title="Pago de alquiler" eyebrow={payer ? `Paga: ${payer.fullName}` : undefined} />;

  if (!payer) {
    return (
      <>
        {header}
        <div className="mt-3">
          <FormCard>
            <form action="/pagos/alquiler" className="space-y-4">
              <Field label="¿Quién paga?">
                <SearchPicker name="cliente" options={clients.map((c) => ({ value: c.id, label: c.fullName }))} required />
              </Field>
              <button type="submit" className="flex h-[50px] w-full items-center justify-center rounded-xl bg-brand font-semibold text-white">Continuar</button>
            </form>
          </FormCard>
        </div>
      </>
    );
  }
  const pending = (await clientRentals(ctx.db, payer.id)).filter((r) => (r.status === "agendada" || r.status === "usado") && r.account.outstanding > 0);
  return (
    <>
      {header}
      {pending.length === 0 ? (
        <div className="mt-3"><Notice>Este cliente no tiene alquileres pendientes de pago.</Notice></div>
      ) : (
        <div className="mt-3">
          <FormCard>
            <ActionForm action={rentalPaymentAction}>
              <input type="hidden" name="payerId" value={payer.id} />
              <RentalPicker
                rentals={pending.map((r) => ({
                  id: r.id,
                  label: `${shortDate(r.localDate)} · ${hhmm(localMinute(r.startsAt))}`,
                  detail: `${r.court} · ${r.turns} turno${r.turns > 1 ? "s" : ""} · ${STATUS_LABEL[r.status]}${r.account.paid ? " · recargo pendiente" : ""}`,
                  outstanding: r.account.outstanding,
                }))}
              />
              <Field label="Medio de pago">
                <Select name="method" defaultValue="efectivo">
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                </Select>
              </Field>
              <Field label="Fecha del pago">
                <Input type="date" name="paidOn" defaultValue={localDate(ctx.now)} required />
              </Field>
              <Field label="Referencia (opcional)">
                <Input name="reference" />
              </Field>
              <p className="text-xs text-muted">Cada alquiler se paga completo. Si se paga antes de usarlo y luego hay caddie, el recargo queda como un cobro aparte.</p>
              <SubmitButton>Registrar pago</SubmitButton>
            </ActionForm>
          </FormCard>
        </div>
      )}
    </>
  );
}
