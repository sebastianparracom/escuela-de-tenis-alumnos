import type { CalendarKind } from "./calendar";
import { hhmm } from "./time";

export type Band = {
  calendar: CalendarKind;
  startMin: number;
  endMin: number;
  turnMinutes: number;
  isNight: boolean;
};

export type Turn = { startMin: number; endMin: number; isNight: boolean };

export const TURN_OPTIONS = [45, 60] as const; // D-39
export const MAX_END_MIN = 23 * 60 + 59; // D-41

/** Divide las franjas de un calendario en turnos pegados (CA-11, D-40). */
export function turnsOf(bands: Band[], calendar: CalendarKind): Turn[] {
  const turns: Turn[] = [];
  for (const b of bands.filter((x) => x.calendar === calendar)) {
    for (let t = b.startMin; t + b.turnMinutes <= b.endMin; t += b.turnMinutes) {
      turns.push({ startMin: t, endMin: t + b.turnMinutes, isNight: b.isNight });
    }
  }
  return turns.sort((a, b) => a.startMin - b.startMin);
}

/** Las dos horas de fin exactas más cercanas a la pedida (D-42). */
export function suggestEnds(startMin: number, endMin: number, turnMinutes: number): number[] {
  const span = endMin - startMin;
  const lower = startMin + Math.floor(span / turnMinutes) * turnMinutes;
  const upper = startMin + Math.ceil(span / turnMinutes) * turnMinutes;
  return [lower, upper].filter((v, i, a) => v > startMin && v <= MAX_END_MIN && a.indexOf(v) === i);
}

/** Valida un conjunto de franjas. Devuelve la lista de problemas (vacía si todo está bien). */
export function validateBands(bands: Band[]): string[] {
  const errors: string[] = [];
  for (const b of bands) {
    const label = `${b.calendar === "entre_semana" ? "Entre semana" : "Fin de semana"} ${hhmm(b.startMin)}–${hhmm(b.endMin)}`;
    if (!TURN_OPTIONS.includes(b.turnMinutes as 45 | 60)) {
      errors.push(`${label}: los turnos son de 45 o 60 minutos.`);
      continue;
    }
    if (b.startMin < 0 || b.endMin > MAX_END_MIN || b.startMin >= b.endMin) {
      errors.push(`${label}: la franja debe empezar antes de terminar y no puede pasar de las 23:59.`);
      continue;
    }
    if ((b.endMin - b.startMin) % b.turnMinutes !== 0) {
      const opts = suggestEnds(b.startMin, b.endMin, b.turnMinutes).map(hhmm).join(" o ");
      errors.push(`${label}: no da turnos exactos de ${b.turnMinutes} minutos. Puede terminar a las ${opts}.`);
    }
  }
  for (const cal of ["entre_semana", "fin_de_semana"] as const) {
    const list = bands.filter((b) => b.calendar === cal).sort((a, b) => a.startMin - b.startMin);
    for (let i = 1; i < list.length; i++) {
      if (list[i].startMin < list[i - 1].endMin) {
        errors.push(
          `${cal === "entre_semana" ? "Entre semana" : "Fin de semana"}: las franjas ${hhmm(list[i - 1].startMin)}–${hhmm(list[i - 1].endMin)} y ${hhmm(list[i].startMin)}–${hhmm(list[i].endMin)} se solapan.`,
        );
      }
    }
  }
  return errors;
}

function sameBand(a: Band, b: Band) {
  return (
    a.calendar === b.calendar &&
    a.startMin === b.startMin &&
    a.endMin === b.endMin &&
    a.turnMinutes === b.turnMinutes &&
    a.isNight === b.isNight
  );
}

/** Intervalos [inicio, fin) de un calendario que cambian entre dos juegos de franjas (CA-12). */
export function changedIntervals(oldBands: Band[], newBands: Band[], calendar: CalendarKind): [number, number][] {
  const o = oldBands.filter((b) => b.calendar === calendar);
  const n = newBands.filter((b) => b.calendar === calendar);
  const changed: [number, number][] = [];
  for (const b of o) if (!n.some((x) => sameBand(x, b))) changed.push([b.startMin, b.endMin]);
  for (const b of n) if (!o.some((x) => sameBand(x, b))) changed.push([b.startMin, b.endMin]);
  return changed;
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/** Busca `count` turnos consecutivos y pegados que empiezan en `startMin` (CA-16, D-10). */
export function consecutiveTurns(turns: Turn[], startMin: number, count: number): Turn[] | null {
  const i = turns.findIndex((t) => t.startMin === startMin);
  if (i < 0) return null;
  const slice = turns.slice(i, i + count);
  if (slice.length !== count) return null;
  for (let k = 1; k < slice.length; k++) if (slice[k].startMin !== slice[k - 1].endMin) return null;
  return slice;
}
