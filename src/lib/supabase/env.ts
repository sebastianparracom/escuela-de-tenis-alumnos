/** Variables de Supabase en Vercel (con alternativas por nombre; las vacías se ignoran). */
function first(...names: string[]) {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v;
  }
  return null;
}

export function supabaseUrl() {
  const v = first("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
  if (!v) throw new Error("Falta SUPABASE_URL.");
  return v;
}

export function supabasePublicKey() {
  const v = first("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");
  if (!v) throw new Error("Falta la llave pública de Supabase.");
  return v;
}

export function supabaseSecretKey() {
  const v = first("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  if (!v) throw new Error("Falta la llave secreta de Supabase.");
  return v;
}
