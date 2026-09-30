import { addDays, isoWeekday } from "./time";

export type Frequency = "semanal" | "quincenal" | "mensual";
export type Period = { start: string; end: string };

function lastDayOfMonth(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Período de liquidación que contiene una fecha (D-31). */
export function periodFor(date: string, frequency: Frequency): Period {
  if (frequency === "semanal") {
    const start = addDays(date, 1 - isoWeekday(date));
    return { start, end: addDays(start, 6) };
  }
  const ym = date.slice(0, 8);
  if (frequency === "mensual") return { start: `${ym}01`, end: lastDayOfMonth(date) };
  const day = Number(date.slice(8, 10));
  return day <= 15 ? { start: `${ym}01`, end: `${ym}15` } : { start: `${ym}16`, end: lastDayOfMonth(date) };
}

export function previousPeriod(p: Period, frequency: Frequency): Period {
  return periodFor(addDays(p.start, -1), frequency);
}

export function nextPeriod(p: Period, frequency: Frequency): Period {
  return periodFor(addDays(p.end, 1), frequency);
}
