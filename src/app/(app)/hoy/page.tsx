import { ClassList } from "@/components/class-list";
import { Empty, Group, LinkButton, PageHeader, Row, SectionTitle } from "@/components/ui";
import { longDate } from "@/lib/format";
import { periodFor } from "@/lib/periods";
import { localDate } from "@/lib/time";
import { getSettings } from "@/server/config";
import { personSessions } from "@/server/payroll";
import { profesorToday } from "@/server/queries";
import { ctxOf, requireUser } from "@/server/session";

export const metadata = { title: "Hoy" };

/** CA-30: clases del día del profesor y pendientes por cerrar. */
export default async function HoyPage() {
  const user = await requireUser(["profesor"]);
  const ctx = await ctxOf(user);
  const today = localDate(ctx.now);
  const settings = await getSettings(ctx.db);
  const period = periodFor(today, settings.payrollFrequency);
  const [{ today: classes, pending }, sessions] = await Promise.all([
    profesorToday(ctx.db, user.id, today, ctx.now),
    personSessions(ctx.db, user.id, period),
  ]);
  return (
    <>
      <PageHeader
        eyebrow={`${longDate(today)} · ${user.fullName}`}
        title="Hoy"
        action={<LinkButton href="/tablero" icon="plus">Agendar</LinkButton>}
      />
      {pending.length > 0 && (
        <>
          <SectionTitle tone="danger">Pendientes por cerrar · {pending.length}</SectionTitle>
          <ClassList items={pending} showDate />
        </>
      )}
      <SectionTitle>Clases de hoy · {classes.length}</SectionTitle>
      {classes.length ? <ClassList items={classes} showStatus /> : <Group><Empty>No tienes clases hoy.</Empty></Group>}
      <SectionTitle>Liquidación</SectionTitle>
      <Group>
        <Row href="/sesiones" title="Sesiones del período" subtitle={`${period.start.slice(8)}/${period.start.slice(5, 7)} – ${period.end.slice(8)}/${period.end.slice(5, 7)}`} trailing={<span className="font-mono text-[22px] font-semibold">{sessions.total}</span>} />
      </Group>
    </>
  );
}
