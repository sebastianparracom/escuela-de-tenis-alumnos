import { Board, BoardLegend } from "@/components/board";
import { DateSwitcher } from "@/components/date-switcher";
import { Notice, PageHeader } from "@/components/ui";
import { longDate } from "@/lib/format";
import { addDays, isValidDate, localDate, localMinute } from "@/lib/time";
import { getSettings } from "@/server/config";
import { agendaDay } from "@/server/queries";
import { ctxOf, requireUser } from "@/server/session";

export const metadata = { title: "Reservar cancha" };

/** CA-16: el cliente ve libre / ocupado (D-11) y reserva turnos libres. */
export default async function ReservarPage({ searchParams }: PageProps<"/reservar">) {
  const user = await requireUser(["cliente"]);
  const ctx = await ctxOf(user);
  const sp = await searchParams;
  const today = localDate(ctx.now);
  const settings = await getSettings(ctx.db);
  const last = addDays(today, settings.clientMaxDays);
  let date = typeof sp.fecha === "string" && isValidDate(sp.fecha) ? sp.fecha : today;
  if (date < today) date = today;
  if (date > last) date = last;
  const day = await agendaDay(ctx.db, date, { id: user.id, roles: ["cliente"] });
  return (
    <>
      <PageHeader eyebrow="Alquiler de cancha" title="Reservar" />
      <DateSwitcher date={date} label={longDate(date)} isToday={date === today} prev={date > today ? addDays(date, -1) : today} next={date < last ? addDays(date, 1) : last} />
      <BoardLegend client />
      <Board
        day={day}
        pastBefore={date === today ? localMinute(ctx.now) + 1 : undefined}
        freeHref={(courtId, startMin) => `/reservar/confirmar?cancha=${courtId}&fecha=${date}&turno=${startMin}`}
      />
      <div className="mt-3">
        <Notice>
          Toca un turno libre. Puedes reservar hasta {settings.clientMaxTurns} turnos seguidos y hasta {settings.clientMaxDays} días adelante. La reserva queda confirmada sin pago previo.
        </Notice>
      </div>
    </>
  );
}
