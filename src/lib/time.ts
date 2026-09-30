// Colombia no tiene horario de verano: la hora local siempre es UTC−5 (RNF-06).
const OFFSET_MIN = -5 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha local "YYYY-MM-DD" de un instante. */
export function localDate(instant: Date = new Date()): string {
  return new Date(instant.getTime() + OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** Minuto del día (0–1439) en hora local de un instante. */
export function localMinute(instant: Date = new Date()): number {
  const shifted = new Date(instant.getTime() + OFFSET_MIN * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** Instante de una fecha local y un minuto del día. */
export function toInstant(date: string, minute: number): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - OFFSET_MIN * 60_000 + minute * 60_000);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** "HH:MM" → minuto del día. */
export function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** minuto del día → "HH:MM" (24 h). */
export function hhmm(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function minuteOfInstant(instant: Date): number {
  return localMinute(instant);
}
