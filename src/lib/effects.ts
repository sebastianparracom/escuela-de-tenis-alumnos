/**
 * Efecto contable de un cierre: cuánto mueve cada bolsa y cuántas sesiones suma cada persona.
 * Un cierre o una corrección se registran como la diferencia entre el efecto nuevo y el anterior,
 * así nada se edita ni se borra (RN-14, CA-37).
 */
export type ClosureState = {
  kind: "individual" | "grupal" | "alquiler";
  status: string;
  studentId: string | null;
  profesorId: string | null;
  caddieId: string | null;
  turns: number;
  /** alumnos (students.id) de los niños presentes en una clase de grupo */
  presentStudentIds: string[];
};

export type BagKey = `${string}|individual` | `${string}|grupal`;
export type SessionKey = `${string}|profesor` | `${string}|caddie`;

export type Effects = { bags: Map<BagKey, number>; sessions: Map<SessionKey, number> };

function add<K>(m: Map<K, number>, k: K, v: number) {
  m.set(k, (m.get(k) ?? 0) + v);
}

export function effectsOf(s: ClosureState): Effects {
  const bags = new Map<BagKey, number>();
  const sessions = new Map<SessionKey, number>();
  if (s.kind === "individual" && s.status === "dictada") {
    // CA-32: descuenta 1 de la bolsa individual, 1 sesión al profesor y, si hubo, al caddie.
    add(bags, `${s.studentId!}|individual`, -1);
    add(sessions, `${s.profesorId!}|profesor`, 1);
    if (s.caddieId) add(sessions, `${s.caddieId}|caddie`, 1);
  } else if (s.kind === "grupal" && s.status === "dictada") {
    // CA-35: 1 de la bolsa grupal de cada presente; ausentes no descuentan.
    for (const st of s.presentStudentIds) add(bags, `${st}|grupal`, -1);
    add(sessions, `${s.profesorId!}|profesor`, 1);
    if (s.caddieId) add(sessions, `${s.caddieId}|caddie`, 1);
  } else if (s.kind === "alquiler" && s.status === "usado") {
    // CA-36: el caddie suma 1 sesión por cada turno.
    if (s.caddieId) add(sessions, `${s.caddieId}|caddie`, s.turns);
  }
  return { bags, sessions };
}

export function diffEffects(before: Effects, after: Effects): Effects {
  const bags = new Map<BagKey, number>();
  const sessions = new Map<SessionKey, number>();
  for (const k of new Set([...before.bags.keys(), ...after.bags.keys()])) {
    const d = (after.bags.get(k) ?? 0) - (before.bags.get(k) ?? 0);
    if (d !== 0) bags.set(k, d);
  }
  for (const k of new Set([...before.sessions.keys(), ...after.sessions.keys()])) {
    const d = (after.sessions.get(k) ?? 0) - (before.sessions.get(k) ?? 0);
    if (d !== 0) sessions.set(k, d);
  }
  return { bags, sessions };
}
