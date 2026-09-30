import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Field, FormCard, Group, Notice, PageHeader, Row, SectionTitle, Textarea } from "@/components/ui";
import { bookings, courts, packages, profiles } from "@/db/schema";
import { DomainError } from "@/lib/errors";
import { fullDate, money, shortDate } from "@/lib/format";
import { LOOSE_LABEL, METHOD_LABEL } from "@/lib/labels";
import { hhmm, localMinute } from "@/lib/time";
import { paymentDetail } from "@/server/payments";
import { studentInfo } from "@/server/people";
import { ctxOf, requireUser } from "@/server/session";
import { voidPaymentAction } from "../actions";

export const metadata = { title: "Pago" };

export default async function PagoPage({ params, searchParams }: PageProps<"/pagos/[id]">) {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const { id } = await params;
  const sp = await searchParams;
  let d;
  try {
    d = await paymentDetail(ctx.db, id);
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
  const p = d.payment;
  const names = await ctx.db.select({ id: profiles.id, n: profiles.fullName }).from(profiles).where(inArray(profiles.id, [p.payerId, p.createdBy, p.voidedBy].filter(Boolean) as string[]));
  const name = (x: string | null) => names.find((n) => n.id === x)?.n ?? "—";
  const student = p.studentId ? await studentInfo(ctx.db, p.studentId) : null;
  const [pkg] = p.packageId ? await ctx.db.select().from(packages).where(eq(packages.id, p.packageId)) : [];
  const rentalRows = d.rentals.length
    ? await ctx.db
        .select({ id: bookings.id, localDate: bookings.localDate, startsAt: bookings.startsAt, court: courts.name, turns: bookings.turns })
        .from(bookings)
        .innerJoin(courts, eq(courts.id, bookings.courtId))
        .where(inArray(bookings.id, d.rentals.map((r) => r.bookingId)))
    : [];
  return (
    <>
      <PageHeader back={{ href: "/pagos", label: "Pagos" }} title={money(p.amount)} eyebrow={p.kind === "alquiler" ? "Pago de alquiler" : "Pago de clases"} />
      {sp.nuevo && <div className="mt-2"><Notice tone="green">Pago registrado.</Notice></div>}
      {p.status === "anulado" && (
        <div className="mt-2">
          <Notice tone="red">Anulado por {name(p.voidedBy)}: {p.voidReason}</Notice>
        </div>
      )}
      <SectionTitle>Detalle</SectionTitle>
      <Group>
        <Row title={name(p.payerId)} subtitle="Pagó" />
        {student && <Row title={student.name} subtitle="Recibe las clases" />}
        {p.kind === "clases" && (
          <Row
            title={pkg ? pkg.name : LOOSE_LABEL[p.looseType ?? ""]}
            subtitle={`${p.classes} clase(s) a la bolsa ${p.bag}`}
            trailing={<Badge tone={p.bag === "grupal" ? "blue" : "green"}>+{p.classes}</Badge>}
          />
        )}
        <Row title={fullDate(p.paidOn)} subtitle={`${METHOD_LABEL[p.method]}${p.reference ? ` · ${p.reference}` : ""}`} />
        <Row title={name(p.createdBy)} subtitle={`Registró · ${p.createdAt.toLocaleString("es-CO", { timeZone: "America/Bogota" })}`} />
      </Group>
      {rentalRows.length > 0 && (
        <>
          <SectionTitle>Alquileres cubiertos</SectionTitle>
          <Group>
            {rentalRows.map((r) => (
              <Row key={r.id} href={`/reservas/${r.id}`} title={`${shortDate(r.localDate)} · ${hhmm(localMinute(r.startsAt))}`} subtitle={`${r.court} · ${r.turns} turno(s)`} trailing={<span className="font-mono text-sm">{money(d.rentals.find((x) => x.bookingId === r.id)!.amount)}</span>} />
            ))}
          </Group>
        </>
      )}
      {p.status === "activo" && (
        <>
          <SectionTitle>Anular</SectionTitle>
          <FormCard>
            <ActionForm action={voidPaymentAction.bind(null, id)} confirm="¿Anular este pago? No se borra: queda registrado como anulado.">
              <Field label="Motivo de la anulación" hint={p.kind === "clases" ? "Se descuentan de la bolsa las clases que sumó este pago." : "Los alquileres vuelven a quedar por pagar."}>
                <Textarea name="reason" required rows={2} />
              </Field>
              <SubmitButton variant="danger" size="md">Anular pago</SubmitButton>
            </ActionForm>
          </FormCard>
        </>
      )}
    </>
  );
}
