import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validSecret } from "@/server/install";
import { purgeTestData } from "@/server/purge";

export const dynamic = "force-dynamic";

/**
 * Proceso técnico (D-36): borra los datos de prueba antes de la operación real. No hay botón en la app.
 * curl -X POST https://<dominio>/api/mantenimiento/purgar-pruebas -H "Authorization: Bearer $CRON_SECRET" -H "X-Confirmar: borrar-datos-de-prueba"
 */
export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!validSecret(token)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (request.headers.get("x-confirmar") !== "borrar-datos-de-prueba") {
    return NextResponse.json({ error: "Falta el encabezado X-Confirmar: borrar-datos-de-prueba" }, { status: 400 });
  }
  const ids = await purgeTestData(getDb());
  const sb = supabaseAdmin();
  const failed: string[] = [];
  for (const id of ids) {
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) failed.push(id);
  }
  return NextResponse.json({ ok: true, usuariosEliminados: ids.length, accesosNoEliminados: failed });
}
