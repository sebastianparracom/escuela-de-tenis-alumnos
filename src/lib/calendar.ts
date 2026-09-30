import { getHolidaysByYear } from "colombian-holidays/getHolidaysByYear";
import { isoWeekday } from "./time";

export type CalendarKind = "entre_semana" | "fin_de_semana";

const cache = new Map<number, Set<string>>();

/** Festivos de Colombia (Ley Emiliani y Semana Santa incluidas) por fecha de celebración. */
export function officialHolidays(year: number): Set<string> {
  let set = cache.get(year);
  if (!set) {
    set = new Set(getHolidaysByYear(year).map((h) => h.celebrationDate));
    cache.set(year, set);
  }
  return set;
}

export function officialHolidayName(date: string): string | null {
  const year = Number(date.slice(0, 4));
  return getHolidaysByYear(year).find((h) => h.celebrationDate === date)?.name ?? null;
}

/** overrides: fecha → true (es festivo) / false (no es festivo). D-07. */
export function isHoliday(date: string, overrides: Map<string, boolean>): boolean {
  const o = overrides.get(date);
  if (o !== undefined) return o;
  return officialHolidays(Number(date.slice(0, 4))).has(date);
}

/** Festivos usan el calendario de fin de semana (supuesto 1). */
export function calendarFor(date: string, overrides: Map<string, boolean>): CalendarKind {
  const wd = isoWeekday(date);
  if (wd >= 6 || isHoliday(date, overrides)) return "fin_de_semana";
  return "entre_semana";
}
