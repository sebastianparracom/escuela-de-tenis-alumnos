/** Acceso simulado SOLO para desarrollo local (DEV_AUTH=1 con `next dev`). En producción nunca aplica. */
export function devAuthEnabled() {
  return process.env.DEV_AUTH === "1" && process.env.NODE_ENV === "development";
}
export const DEV_COOKIE = "dev_user";
