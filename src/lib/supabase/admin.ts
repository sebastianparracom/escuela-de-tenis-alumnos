import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { AuthAdmin } from "@/server/people";
import { supabaseSecretKey, supabaseUrl } from "./env";

/** Cliente con la llave secreta: solo en el servidor, nunca llega al navegador. */
export function supabaseAdmin() {
  return createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function fail(action: string, message?: string): never {
  const m = message ?? "";
  if (/already.*registered|already exists/i.test(m)) throw new Error("Ya existe un usuario con ese correo en el sistema de acceso.");
  throw new Error(`No se pudo ${action}: ${m}`);
}

export const supabaseAuthAdmin: AuthAdmin = {
  async createUser(email, password) {
    const { data, error } = await supabaseAdmin().auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) fail("crear el usuario", error?.message);
    return data.user.id;
  },
  async setPassword(userId, password) {
    const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { password });
    if (error) fail("cambiar la contraseña", error.message);
  },
  async setEmail(userId, email) {
    const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) fail("cambiar el correo", error.message);
  },
  async setBanned(userId, banned) {
    const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { ban_duration: banned ? "876000h" : "none" });
    if (error) fail(banned ? "desactivar el acceso" : "reactivar el acceso", error.message);
  },
};

export const BUCKET_PUBLIC = "publico"; // logo
export const BUCKET_PHOTOS = "fotos"; // fotos de perfil (privado)

export async function uploadFile(bucket: string, path: string, file: File) {
  const { error } = await supabaseAdmin().storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  return path;
}

export function publicUrl(path: string) {
  return supabaseAdmin().storage.from(BUCKET_PUBLIC).getPublicUrl(path).data.publicUrl;
}

export async function signedPhotoUrls(paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await supabaseAdmin().storage.from(BUCKET_PHOTOS).createSignedUrls(unique, 60 * 60);
  return new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl]));
}
