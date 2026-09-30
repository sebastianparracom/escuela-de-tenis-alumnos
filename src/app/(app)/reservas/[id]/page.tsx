import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Field, FormCard, Group, Notice, PageHeader, Row, SectionTitle, Select } from "@/components/ui";
import { longDate, money } from "@/lib/format";
import { KIND_LABEL, KIND_TONE, STATUS_LABEL, STATUS_TONE } from "@/lib/labels";
import { diffDays, localDate } from "@/lib/time";
import { DomainError } from "@/lib/errors";
import { CADDIE_ADD_WINDOW_DAYS, bookingTimes } from "@/server/bookings";
import { listReasons } from "@/server/config";
import { usersWithRole } from "@/server/people";
import { bookingView } from "@/server/queries";
import { ctxOf, homeFor, requireUser } from "@/server/session";
import { getDb } from "@/db";
import { children } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import {
  addGuestAction,
  assignCaddieAction,
  cancelRentalAction,
  changeProfesorAction,
  closeClassAction,
  closeRentalAction,
  correctAction,
  removeGuestAction,
} from "../actions";
import { ClosureForm } from "./closure-form";

export const metadata = { title: "Reserva" };

export default async function ReservaPage({ params, searchParams }: PageProps<"/reservas/[id]">) {
  const user = await requireUser();
  const ctx = await ctxOf(user);
  const { id } = await params;
  const sp = await searchParams;
  let v;
  try {
    v = await bookingView(ctx.db, id, ctx.actor);
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
  const b = v.booking;
  const t = bookingTimes(b);
  const started = ctx.now >= b.startsAt;
  const closed = b.status !== "agendada";
  const isClass = b.kind !== "alquiler";
  const needsStaffLists = v.can.manage || v.can.admin;
  const [caddies, reasons, profesores] = needsStaffLists
    ? await Promise.all([usersWithRole(ctx.db, "caddie"), listReasons(ctx.db), v.can.admin ? usersWithRole(ctx.db, "profesor") : Promise.resolve([])])
    : [[], [], []];
  const kids =
    v.can.manage && b.kind === "grupal" && !closed
      ? await getDb().select({ id: children.id, fullName: children.fullName }).from(children).where(eq(children.isActive, true)).orderBy(asc(children.fullName))
      : [];
  const title = b.kind === "grupal" ? `Grupo ${v.group?.name}` : b.kind === "individual" ? v.student ?? "Clase" : "Alquiler";
  const daysSince = diffDays(b.localDate, localDate(ctx.now));
  const canAddCaddie =
    (b.status === "dictada" || b.status === "usado") &&
    !b.caddieId &&
    (v.can.admin || (b.kind !== "alquiler" && v.can.manage && daysSince <= CADDIE_ADD_WINDOW_DAYS));
  const back = user.roles.includes("admin") || user.roles.includes("profesor") ? { href: `/tablero?fecha=${b.localDate}`, label: "Tablero" } : { href: homeFor(user.roles), label: "Inicio" };

  return (
    <>
      <PageHeader back={back} title={title} eyebrow={isClass ? "Clase" : "Alquiler de cancha"} />
      {sp.nueva && <div className="mt-2"><Notice tone="green">Reserva guardada.</Notice></div>}
      <div className="mt-3 flex flex-wrap gap-2 px-4">
        <Badge tone={KIND_TONE[b.kind]}>{KIND_LABEL[b.kind]}</Badge>
        <Badge tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
        {b.nightTurns > 0 && <Badge>{b.nightTurns === b.turns ? "Nocturna" : `${b.nightTurns} nocturno(s)`}</Badge>}
      </div>

      <SectionTitle>Detalle</SectionTitle>
      <Group>
        <Row title={longDate(b.localDate)} subtitle={`${t.start} – ${t.end}${b.turns > 1 ? ` · ${b.turns} turnos` : ""}`} trailing={<span className="text-sm text-muted">{v.court}</span>} />
        {v.profesor && <Row title={v.profesor} subtitle="Profesor" />}
        {v.student && <Row title={v.student} subtitle="Alumno" />}
        {v.client && <Row title={v.client} subtitle="Cliente" />}
        <Row title={v.caddie ?? "Sin caddie"} subtitle="Caddie" />
        {v.reason && <Row title={v.reason} subtitle="Motivo" />}
        {closed && v.closedBy && <Row title={v.closedBy} subtitle="Cerró" />}
      </Group>

      {v.account && (
        <>
          <SectionTitle>Cobro</SectionTitle>
          <Group>
            <Row title="Valor" trailing={<span className="font-mono font-semibold">{money(v.account.value)}</span>} />
            <Row title="Pagado" trailing={<span className="font-mono">{money(v.account.paid)}</span>} />
            <Row
              title={v.account.outstanding >= 0 ? "Por pagar" : "Pagado de más"}
              trailing={<span className={`font-mono font-semibold ${v.account.outstanding > 0 ? "text-danger" : ""}`}>{money(Math.abs(v.account.outstanding))}</span>}
            />
          </Group>
          {v.account.outstanding < 0 && v.can.admin && (
            <div className="mt-2">
              <Notice tone="red">Este alquiler tiene un pago que ya no corresponde. Anula el pago desde Pagos (la devolución se hace por fuera del sistema).</Notice>
            </div>
          )}
        </>
      )}

      {b.kind === "grupal" && (v.can.manage || closed) && v.participants.length > 0 && closed && (
        <>
          <SectionTitle aside={`${v.participants.filter((p) => p.present).length} / ${v.participants.length}`}>Asistencia</SectionTitle>
          <Group>
            {v.participants.map((p) => (
              <Row key={p.childId} title={p.fullName} subtitle={p.isGuest ? "Invitado" : undefined} trailing={<Badge tone={p.present ? "green" : "gray"}>{p.present ? "Presente" : "Ausente"}</Badge>} />
            ))}
          </Group>
        </>
      )}

      {/* ---------- Clase sin cerrar ---------- */}
      {isClass && !closed && v.can.manage && (
        <>
          {!started && (
            <>
              <SectionTitle>Caddie</SectionTitle>
              <FormCard>
                <ActionForm action={assignCaddieAction.bind(null, b.id)}>
                  <Field label="Caddie" hint="Opcional. También se puede asignar al cerrar la clase.">
                    <Select name="caddieId" defaultValue={b.caddieId ?? ""}>
                      <option value="">Sin caddie</option>
                      {caddies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitButton variant="secondary" size="md">Guardar caddie</SubmitButton>
                </ActionForm>
              </FormCard>
            </>
          )}
          {b.kind === "grupal" && (
            <>
              <SectionTitle>Invitados</SectionTitle>
              <FormCard>
                {v.participants.filter((p) => p.isGuest).map((p) => (
                  <ActionForm key={p.childId} action={removeGuestAction.bind(null, b.id, p.childId)} className="flex items-center justify-between gap-3 space-y-0">
                    <span className="text-[15px]">{p.fullName}</span>
                    <SubmitButton variant="ghost" size="sm" full={false} pendingText="…">Quitar</SubmitButton>
                  </ActionForm>
                ))}
                <ActionForm action={addGuestAction.bind(null, b.id)} onSuccess="reset">
                  <Field label="Agregar un niño a esta clase" hint="Para reposiciones o clases de prueba. Si asiste, descuenta de su bolsa grupal.">
                    <Select name="childId" defaultValue="">
                      <option value="">Escoge un niño</option>
                      {kids.filter((k) => !v.participants.some((p) => p.childId === k.id)).map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.fullName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitButton variant="secondary" size="md">Agregar</SubmitButton>
                </ActionForm>
              </FormCard>
            </>
          )}
          {b.kind === "grupal" && v.can.admin && (
            <>
              <SectionTitle>Profesor de esta clase</SectionTitle>
              <FormCard>
                <ActionForm action={changeProfesorAction.bind(null, b.id)}>
                  <Field label="Suplente" hint="Solo cambia esta clase; la sesión suma al profesor que la dicte.">
                    <Select name="profesorId" defaultValue={b.profesorId ?? ""}>
                      {profesores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitButton variant="secondary" size="md">Cambiar profesor</SubmitButton>
                </ActionForm>
              </FormCard>
            </>
          )}
          <SectionTitle>{started ? "Cerrar clase" : "Cancelar o cerrar"}</SectionTitle>
          <FormCard>
            <ClosureForm
              mode="close"
              kind={b.kind}
              action={closeClassAction.bind(null, b.id)}
              caddies={caddies}
              reasons={reasons}
              participants={v.participants}
              defaultCaddieId={b.caddieId}
              canBePositive={started}
              defaultPositive={started}
              profesorName={v.profesor}
            />
          </FormCard>
        </>
      )}

      {/* ---------- Alquiler sin cerrar ---------- */}
      {b.kind === "alquiler" && !closed && (
        <>
          {v.can.cancelRental && !started && (
            <>
              <SectionTitle>Cancelar</SectionTitle>
              <FormCard>
                <ActionForm action={cancelRentalAction.bind(null, b.id)} confirm="¿Cancelar esta reserva? El turno quedará libre.">
                  <p className="text-sm text-muted">Puedes cancelar hasta la hora de inicio. No tiene costo.</p>
                  <SubmitButton variant="danger">Cancelar reserva</SubmitButton>
                </ActionForm>
              </FormCard>
            </>
          )}
          {v.can.admin && (
            <>
              <SectionTitle>Cerrar alquiler</SectionTitle>
              <FormCard>
                <ClosureForm mode="close" kind="alquiler" action={closeRentalAction.bind(null, b.id)} caddies={caddies} reasons={reasons} canBePositive={started} defaultPositive />
              </FormCard>
            </>
          )}
        </>
      )}

      {/* ---------- Cerrada ---------- */}
      {canAddCaddie && (
        <>
          <SectionTitle>Agregar caddie</SectionTitle>
          <FormCard>
            <ActionForm action={assignCaddieAction.bind(null, b.id)}>
              <Field
                label="¿Se olvidó registrar el caddie?"
                hint={v.can.admin ? "Suma las sesiones del caddie." : `Puedes agregarlo hasta ${CADDIE_ADD_WINDOW_DAYS} días después de la clase.`}
              >
                <Select name="caddieId" required defaultValue="">
                  <option value="" disabled>
                    Escoge el caddie
                  </option>
                  {caddies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </Select>
              </Field>
              <SubmitButton variant="secondary" size="md">Agregar caddie</SubmitButton>
            </ActionForm>
          </FormCard>
        </>
      )}

      {closed && v.can.admin && b.status !== "cancelada_cliente" && (
        <details className="group mt-2">
          <summary className="mx-4 mt-4 flex min-h-11 cursor-pointer list-none items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold text-ink">
            Corregir cierre
          </summary>
          <div className="mt-3">
            <FormCard>
              <ClosureForm
                mode="correct"
                kind={b.kind}
                action={correctAction.bind(null, b.id)}
                caddies={caddies}
                reasons={reasons}
                participants={v.participants}
                defaultCaddieId={b.caddieId}
                defaultPositive={b.status === "dictada" || b.status === "usado"}
                defaultReasonId={b.cancelReasonId}
                canBePositive={started}
                profesorName={v.profesor}
              />
            </FormCard>
          </div>
        </details>
      )}
    </>
  );
}
