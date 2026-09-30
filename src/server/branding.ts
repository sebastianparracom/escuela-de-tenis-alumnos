import "server-only";
import { cache } from "react";
import { getDb } from "@/db";
import { publicUrl } from "@/lib/supabase/admin";
import { getSettings } from "./config";

/** Nombre y logo de la escuela, editables por el administrador (D-33). */
export const getBranding = cache(async () => {
  try {
    const s = await getSettings(getDb());
    return { name: s.schoolName, logoUrl: s.logoPath ? publicUrl(s.logoPath) : null };
  } catch {
    return { name: "Escuela de Tenis", logoUrl: null };
  }
});
