import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Field, FormCard, Group, Input, Notice, PageHeader, Row, SectionTitle, Select, TimeBlock } from "@/components/ui";
import { children } from "@/db/schema";
import { DomainError } from "@/lib/errors";
import { fullDate, shortDate, weekdayName } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/labels";
import { hhmm, localDate, localMinute } from "@/lib/time";
import { listCourts } from "@/server/config";
import { groupDetail, turnStartsAt, upcomingOccurrences } from "@/server/groups";
import { usersWithRole } from "@/server/people";
import { ctxOf, requireUser } from "@/server/session";
import { addMemberAction, removeMemberAction, scheduleAction, updateGroupAction } from "../actions";
import { DaysEditor } from "../days-editor";

export const metadata = { title: "Grupo" };

export default async function GrupoPage({ params, searchParams }: PageProps<"/grupos/[id]">) {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const id = Number((await params).id);
  const sp = await searchParams;
  const today = localDate(ctx.now);
  let d;
  try {
    d = await groupDetail(ctx.db, id, today);
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
  const g = d.group;
  const [profesores, courts, turns, kids, upcoming] = await Promise.all([
    usersWithRole(ctx.db, "profesor"),
    listCourts(ctx.db, true),
    turnStartsAt(ctx.db, today),
    ctx.db.select({ id: children.id, fullName: children.fullName }).from(children).where(eq(children.isActive, true)),
    upcomingOccurrences(ctx.db, id, ctx.now),
  ]);
  const current = d.schedule.filter((s) => s.validFrom <= today || d.schedule.every((x) => x.validFrom > today));
  const future = d.schedule.filter((s) => s.validFrom > today && !current.includes(s));
  const editable = (future.length ? future : current).map((s) => ({ weekday: s.weekday, startMin: s.startMin, courtId: s.courtId }));
  const available = kids.filter((k) => !d.members.some((m) => m.childId === k.id));
  return (
    <>
      <PageHeader back={{ href: "/grupos", label: "Grupos" }} title={g.name} eyebrow={`Grupo · ${g.code}`} />
      {sp.creado && <div className="mt-2"><Notice tone="green">Grupo creado. Sus clases quedaron reservadas en la agenda.</Notice></div>}
      {!g.isActive && <div className="mt-2"><Notice tone="red">Grupo inactivo: no tiene clases futuras.</Notice></div>}

      <SectionTitle>Horario</SectionTitle>
      <Group>
        {current.map((s) => (
          <Row key={`${s.weekday}-${s.validFrom}`} title={`${weekdayName(s.weekday).replace(/^./, (c) => c.toUpperCase())} · ${hhmm(s.startMin)}`} subtitle={s.court} />
        ))}
        {future.map((s) => (
          <Row key={`f${s.weekday}-${s.validFrom}`} title={`${weekdayName(s.weekday).replace(/^./, (c) => c.toUpperCase())} · ${hhmm(s.startMin)}`} subtitle={`${s.court} · desde ${fullDate(s.validFrom)}`} trailing={<Badge tone="blue">Próximo</Badge>} />
        ))}
      </Group>
      <p className="px-6 pt-2 text-xs text-muted">
        Desde {fullDate(g.startDate)}
        {g.endDate ? ` hasta ${fullDate(g.endDate)}` : ", sin fecha de fin"}. En festivos no hay clase.
      </p>

      <SectionTitle>Próximas clases</SectionTitle>
      <Group>
        {upcoming.length === 0 ? <Row title="No hay clases próximas" /> : upcoming.map((o) => (
          <Row key={o.id} href={`/reservas/${o.id}`} leading={<TimeBlock top={shortDate(o.localDate)} bottom={hhmm(localMinute(o.startsAt))} />} title={o.court} subtitle={o.profesor ?? ""} trailing={<Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>} />
        ))}
      </Group>

      <SectionTitle aside={`${d.members.length}${g.capacity ? ` / ${g.capacity}` : ""}`}>Niños inscritos</SectionTitle>
      <Group>
        {d.members.length === 0 && <Row title="Sin niños inscritos" />}
        {d.members.map((m) => (
          <div key={m.childId} className="flex min-h-14 items-center gap-3 px-3.5 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{m.fullName}</div>
              <div className="text-xs text-muted">Desde {fullDate(m.joinedOn)}{m.leftOn ? ` · sale el ${fullDate(m.leftOn)}` : ""}</div>
            </div>
            {!m.leftOn && (
              <ActionForm action={removeMemberAction.bind(null, id, m.childId)} className="space-y-0" confirm={`¿Retirar a ${m.fullName} del grupo desde hoy?`}>
                <input type="hidden" name="onDate" value={today} />
                <SubmitButton variant="ghost" size="sm" full={false} pendingText="…">Retirar</SubmitButton>
              </ActionForm>
            )}
          </div>
        ))}
      </Group>
      <div className="mt-3">
        <FormCard>
          <ActionForm action={addMemberAction.bind(null, id)} onSuccess="reset">
            <Field label="Inscribir un niño">
              <Select name="childId" defaultValue="">
                <option value="">Escoge un niño</option>
                {available.map((k) => <option key={k.id} value={k.id}>{k.fullName}</option>)}
              </Select>
            </Field>
            <Field label="Desde">
              <Input type="date" name="fromDate" defaultValue={today} required />
            </Field>
            <SubmitButton variant="secondary" size="md">Inscribir</SubmitButton>
          </ActionForm>
        </FormCard>
      </div>

      <SectionTitle>Cambiar horario</SectionTitle>
      <FormCard>
        <ActionForm action={scheduleAction.bind(null, id)}>
          <Field label="Desde qué fecha" hint="Las clases anteriores no cambian.">
            <Input type="date" name="fromDate" defaultValue={today} min={today} required />
          </Field>
          <DaysEditor weekdayTurns={turns.weekday} weekendTurns={turns.weekend} courts={courts} defaults={editable} />
          <SubmitButton variant="secondary" size="md">Guardar horario</SubmitButton>
        </ActionForm>
      </FormCard>

      <SectionTitle>Datos del grupo</SectionTitle>
      <FormCard>
        <ActionForm action={updateGroupAction.bind(null, id)}>
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <Field label="Nombre"><Input name="name" defaultValue={g.name} required /></Field>
            <Field label="Código"><Input name="code" defaultValue={g.code} maxLength={5} required className="uppercase" /></Field>
          </div>
          <Field label="Profesor" hint="Las clases futuras pasan al nuevo profesor.">
            <Select name="profesorId" defaultValue={g.profesorId}>
              {profesores.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cupo"><Input name="capacity" type="number" min={1} defaultValue={g.capacity ?? ""} /></Field>
            <Field label="Fin"><Input type="date" name="endDate" defaultValue={g.endDate ?? ""} /></Field>
          </div>
          <Field label="Estado">
            <Select name="isActive" defaultValue={g.isActive ? "1" : "0"}>
              <option value="1">Activo</option>
              <option value="0">Inactivo (se liberan sus turnos futuros)</option>
            </Select>
          </Field>
          <SubmitButton variant="secondary" size="md">Guardar</SubmitButton>
        </ActionForm>
      </FormCard>
    </>
  );
}
