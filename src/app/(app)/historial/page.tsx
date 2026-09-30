import Link from "next/link";
import { Badge, Empty, Group, PageHeader, Row, SectionTitle, TimeBlock } from "@/components/ui";
import { fullDate, money, shortDate } from "@/lib/format";
import { LOOSE_LABEL, METHOD_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/labels";
import { hhmm, localMinute } from "@/lib/time";
import { paymentsOfStudent } from "@/server/payments";
import { clientRentalPayments, clientRentals, clientStudents, studentClasses } from "@/server/queries";
import { ctxOf, requireUser } from "@/server/session";

export const metadata = { title: "Historial" };

/** CA-40: por separado para el cliente y cada niño: pagos e historial de clases. */
export default async function HistorialPage({ searchParams }: PageProps<"/historial">) {
  const user = await requireUser(["cliente"]);
  const ctx = await ctxOf(user);
  const sp = await searchParams;
  const cards = await clientStudents(ctx.db, user.id, user.fullName);
  const tab = typeof sp.alumno === "string" ? sp.alumno : sp.alquileres ? "alquileres" : cards[0]?.studentId;
  const current = cards.find((c) => c.studentId === tab);
  return (
    <>
      <PageHeader title="Historial" />
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4">
        {cards.map((c) => (
          <Link
            key={c.studentId}
            href={`/historial?alumno=${c.studentId}`}
            className={`flex h-10 shrink-0 items-center rounded-full px-4 text-sm ${c.studentId === tab ? "bg-ink font-semibold text-white" : "border border-line bg-surface"}`}
          >
            {c.isSelf ? "Yo" : c.name.split(" ")[0]}
          </Link>
        ))}
        <Link href="/historial?alquileres=1" className={`flex h-10 shrink-0 items-center rounded-full px-4 text-sm ${tab === "alquileres" ? "bg-ink font-semibold text-white" : "border border-line bg-surface"}`}>
          Alquileres
        </Link>
      </div>
      {current ? <StudentHistory ctxDb={ctx.db} card={current} /> : tab === "alquileres" ? <RentalsHistory ctxDb={ctx.db} clientId={user.id} /> : <Empty>Sin información.</Empty>}
    </>
  );
}

async function StudentHistory({ ctxDb, card }: { ctxDb: Parameters<typeof paymentsOfStudent>[0]; card: Awaited<ReturnType<typeof clientStudents>>[number] }) {
  const [payments, classes] = await Promise.all([paymentsOfStudent(ctxDb, card.studentId), studentClasses(ctxDb, card.studentId, card.childId, {})]);
  return (
    <>
      <div className="mx-4 mt-4 grid grid-cols-2 divide-x divide-line rounded-xl border border-line bg-surface">
        <div className="px-3 py-2.5">
          <div className={`font-mono text-lg font-semibold ${card.balances.individual < 0 ? "text-danger" : ""}`}>{card.balances.individual}</div>
          <div className="text-[11px] text-muted">Bolsa individual</div>
        </div>
        <div className="px-3 py-2.5">
          <div className={`font-mono text-lg font-semibold ${card.balances.grupal < 0 ? "text-danger" : ""}`}>{card.isSelf ? "—" : card.balances.grupal}</div>
          <div className="text-[11px] text-muted">Bolsa grupal</div>
        </div>
      </div>
      <SectionTitle>Clases</SectionTitle>
      {classes.length === 0 ? (
        <Group><Empty>Todavía no hay clases cerradas.</Empty></Group>
      ) : (
        <Group>
          {classes.map((c) => (
            <Row
              key={c.id}
              leading={<TimeBlock top={shortDate(c.localDate)} bottom={hhmm(localMinute(c.startsAt))} />}
              title={c.title}
              subtitle={`${c.profesor ? `${c.profesor} · ` : ""}${c.court}${c.reason ? ` · ${c.reason}` : ""}`}
              trailing={
                c.kind === "grupal" && c.status === "dictada" ? (
                  <Badge tone={c.attendance ? "green" : "gray"}>{c.attendance ? "Asistió" : "No asistió"}</Badge>
                ) : (
                  <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                )
              }
            />
          ))}
        </Group>
      )}
      <SectionTitle>Pagos</SectionTitle>
      {payments.length === 0 ? (
        <Group><Empty>Sin pagos registrados.</Empty></Group>
      ) : (
        <Group>
          {payments.map((p) => (
            <Row
              key={p.id}
              title={p.packageName ?? `${p.classes} ${LOOSE_LABEL[p.looseType ?? ""]?.toLowerCase() ?? "clases"}`}
              subtitle={`${fullDate(p.paidOn)} · ${METHOD_LABEL[p.method]}${p.status === "anulado" ? " · anulado" : ""}`}
              trailing={<span className={`font-mono font-semibold ${p.status === "anulado" ? "text-faint line-through" : ""}`}>{money(p.amount)}</span>}
            />
          ))}
        </Group>
      )}
    </>
  );
}

async function RentalsHistory({ ctxDb, clientId }: { ctxDb: Parameters<typeof paymentsOfStudent>[0]; clientId: string }) {
  const [rentals, pays] = await Promise.all([clientRentals(ctxDb, clientId), clientRentalPayments(ctxDb, clientId)]);
  return (
    <>
      <SectionTitle>Reservas de cancha</SectionTitle>
      {rentals.length === 0 ? (
        <Group><Empty>Sin alquileres.</Empty></Group>
      ) : (
        <Group>
          {rentals.map((r) => (
            <Row
              key={r.id}
              href={`/reservas/${r.id}`}
              leading={<TimeBlock top={shortDate(r.localDate)} bottom={hhmm(localMinute(r.startsAt))} />}
              title={`${r.court} · ${r.turns} turno${r.turns > 1 ? "s" : ""}`}
              subtitle={STATUS_LABEL[r.status]}
              trailing={
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold">{money(r.account.value)}</div>
                  {r.account.outstanding > 0 && <div className="text-[11px] font-semibold text-danger">Por pagar</div>}
                </div>
              }
            />
          ))}
        </Group>
      )}
      <SectionTitle>Pagos de alquiler</SectionTitle>
      {pays.length === 0 ? (
        <Group><Empty>Sin pagos.</Empty></Group>
      ) : (
        <Group>
          {pays.map((p) => (
            <Row key={p.id} title={money(p.amount)} subtitle={`${fullDate(p.paidOn)} · ${METHOD_LABEL[p.method]}${p.status === "anulado" ? " · anulado" : ""}`} />
          ))}
        </Group>
      )}
    </>
  );
}
