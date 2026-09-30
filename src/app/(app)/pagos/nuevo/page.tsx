import { ActionForm, SubmitButton } from "@/components/forms";
import { SearchPicker } from "@/components/picker";
import { Field, FormCard, Input, Notice, PageHeader, Select } from "@/components/ui";
import { localDate } from "@/lib/time";
import { listPackages, priceForOrNull } from "@/server/config";
import { childrenOf, studentIdOfProfile, usersWithRole } from "@/server/people";
import { ctxOf, requireUser } from "@/server/session";
import { classPaymentAction } from "../actions";
import { PurchaseFields } from "./purchase-fields";

export const metadata = { title: "Pago de clases" };

/** CA-23: cliente que paga, alumno que recibe, qué compra, valor, medio, fecha y referencia. */
export default async function NuevoPagoPage({ searchParams }: PageProps<"/pagos/nuevo">) {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const sp = await searchParams;
  const payerId = typeof sp.cliente === "string" && sp.cliente ? sp.cliente : null;
  const clients = await usersWithRole(ctx.db, "cliente");
  const today = localDate(ctx.now);

  if (!payerId || !clients.some((c) => c.id === payerId)) {
    return (
      <>
        <PageHeader back={{ href: "/pagos", label: "Pagos" }} title="Pago de clases" />
        <div className="mt-3">
          <FormCard>
            <form action="/pagos/nuevo" className="space-y-4">
              <Field label="¿Quién paga?">
                <SearchPicker name="cliente" options={clients.map((c) => ({ value: c.id, label: c.fullName }))} required />
              </Field>
              <button type="submit" className="flex h-[50px] w-full items-center justify-center rounded-xl bg-brand font-semibold text-white">
                Continuar
              </button>
            </form>
          </FormCard>
        </div>
      </>
    );
  }

  const payer = clients.find((c) => c.id === payerId)!;
  const self = await studentIdOfProfile(ctx.db, payerId);
  const kids = (await childrenOf(ctx.db, payerId)).filter((k) => k.isActive);
  const studentOptions = [...(self ? [{ id: self, label: `${payer.fullName} (el mismo cliente)`, child: false }] : []), ...kids.map((k) => ({ id: k.studentId, label: k.fullName, child: true }))];
  const chosen = typeof sp.alumno === "string" ? studentOptions.find((s) => s.id === sp.alumno) : studentOptions.length === 1 ? studentOptions[0] : undefined;
  const [packages, prices] = await Promise.all([listPackages(ctx.db, true), priceForOrNull(ctx.db, today)]);

  return (
    <>
      <PageHeader back={{ href: "/pagos", label: "Pagos" }} title="Pago de clases" eyebrow={`Paga: ${payer.fullName}`} />
      {!chosen ? (
        <div className="mt-3">
          <FormCard>
            <form action="/pagos/nuevo" className="space-y-4">
              <input type="hidden" name="cliente" value={payerId} />
              <Field label="¿Para quién son las clases?" hint="El mismo cliente o un niño a su cargo. Las clases no se comparten entre alumnos.">
                <Select name="alumno" required defaultValue="">
                  <option value="" disabled>
                    Escoge el alumno
                  </option>
                  {studentOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <button type="submit" className="flex h-[50px] w-full items-center justify-center rounded-xl bg-brand font-semibold text-white">
                Continuar
              </button>
            </form>
          </FormCard>
        </div>
      ) : (
        <>
          <div className="mt-2 mb-3">
            <Notice>Alumno: <strong>{chosen.label}</strong>. Las individuales van a la bolsa individual y las grupales a la grupal.</Notice>
          </div>
          <FormCard>
            <ActionForm action={classPaymentAction}>
              <input type="hidden" name="payerId" value={payerId} />
              <input type="hidden" name="studentId" value={chosen.id} />
              <PurchaseFields packages={packages} prices={prices} allowGroup={chosen.child} />
              <Field label="Medio de pago">
                <Select name="method" defaultValue="efectivo">
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                </Select>
              </Field>
              <Field label="Fecha del pago">
                <Input type="date" name="paidOn" defaultValue={today} required />
              </Field>
              <Field label="Referencia (opcional)">
                <Input name="reference" placeholder="Ej. número de transferencia" />
              </Field>
              <SubmitButton>Registrar pago</SubmitButton>
            </ActionForm>
          </FormCard>
        </>
      )}
    </>
  );
}
