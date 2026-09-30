import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { syncAllGroups } from "@/server/groups";

export const dynamic = "force-dynamic";

const SYSTEM = { id: "00000000-0000-0000-0000-000000000000", roles: ["admin" as const] };

/**
 * Tarea diaria (Vercel Cron): genera las clases de grupo hasta el horizonte y, de paso,
 * mantiene activo el proyecto gratuito de Supabase.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const result = await syncAllGroups({ db: getDb(), actor: SYSTEM, now: new Date() });
  return NextResponse.json({ ok: true, ...result });
}
