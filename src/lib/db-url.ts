/**
 * Conexión a Postgres a partir de las variables que crea la integración de Supabase en Vercel.
 * Se ignoran las variables vacías. `pgbouncer=true` (propio de Prisma) se quita porque Postgres no lo reconoce.
 */
export function databaseUrl(preferDirect = false): string | null {
  const env = process.env;
  const candidates = preferDirect
    ? [env.POSTGRES_URL_NON_POOLING, env.POSTGRES_URL, env.POSTGRES_PRISMA_URL, env.DATABASE_URL]
    : [env.POSTGRES_URL, env.POSTGRES_PRISMA_URL, env.DATABASE_URL, env.POSTGRES_URL_NON_POOLING];
  const url = candidates.find((v) => v && v.trim());
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.delete("pgbouncer");
    u.searchParams.delete("connection_limit");
    return u.toString();
  } catch {
    return url;
  }
}
