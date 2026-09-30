import { Board, BoardLegend } from "@/components/board";
import { DateSwitcher } from "@/components/date-switcher";
import { Icon } from "@/components/icons";
import { Stat } from "@/components/ui";
import { longDate } from "@/lib/format";
import { addDays, isValidDate, localDate } from "@/lib/time";
import { getBranding } from "@/server/branding";
import { agendaDay } from "@/server/queries";
import { ctxOf, requireUser } from "@/server/session";

export const metadata = { title: "Tablero" };

export default async function TableroPage({ searchParams }: PageProps<"/tablero">) {
  const user = await requireUser(["admin", "profesor"]);
  const ctx = await ctxOf(user);
  const sp = await searchParams;
  const today = localDate(ctx.now);
  const date = typeof sp.fecha === "string" && isValidDate(sp.fecha) ? sp.fecha : today;
  const [day, brand] = await Promise.all([agendaDay(ctx.db, date, ctx.actor), getBranding()]);
  const admin = user.roles.includes("admin");
  return (
    <>
      <header className="px-4 pt-5 pb-1">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
          <Icon name="ball" size={16} strokeWidth={2} className="text-brand" />
          {brand.name}
        </div>
        <h1 className="mt-0.5 text-[30px] font-bold tracking-[-0.03em]">{admin ? "Tablero" : "Agenda"}</h1>
      </header>
      <DateSwitcher date={date} label={longDate(date)} isToday={date === today} prev={addDays(date, -1)} next={addDays(date, 1)} />
      <div className="mx-4 mt-3 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface">
        <Stat value={`${day.stats.occupancy}%`} label="Ocupación" />
        <Stat value={day.stats.classes} label="Clases" />
        <Stat value={day.stats.rentalTurns} label="Turnos alquiler" />
      </div>
      <BoardLegend />
      <Board day={day} freeHref={(courtId, startMin) => `/agenda/nueva?cancha=${courtId}&fecha=${date}&turno=${startMin}`} />
      <p className="px-6 pt-3 text-xs text-muted">Toca un turno libre para agendar{admin ? " una clase o un alquiler" : " una clase"}.</p>
    </>
  );
}
