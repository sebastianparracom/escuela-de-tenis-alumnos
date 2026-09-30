import { hhmm } from "./time";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function money(value: number): string {
  return cop.format(value).replace(/ /g, " ");
}

const WEEKDAYS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const WEEKDAYS_SHORT = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function parts(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return { wd, day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() };
}

/** "Miércoles 30 sep" */
export function longDate(date: string): string {
  const p = parts(date);
  const w = WEEKDAYS[p.wd];
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} ${p.day} ${MONTHS[p.month]}`;
}

/** "Mié 30 sep" */
export function shortDate(date: string): string {
  const p = parts(date);
  return `${WEEKDAYS_SHORT[p.wd]} ${p.day} ${MONTHS[p.month]}`;
}

/** "30 sep 2026" */
export function fullDate(date: string): string {
  const p = parts(date);
  return `${p.day} ${MONTHS[p.month]} ${p.year}`;
}

export function monthName(month: number): string {
  return MONTHS_LONG[month];
}

export function weekdayName(wd: number): string {
  return WEEKDAYS[wd];
}

export function timeRange(startMin: number, endMin: number): string {
  return `${hhmm(startMin)} – ${hhmm(endMin)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}
