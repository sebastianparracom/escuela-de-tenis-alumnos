import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEV_COOKIE, devAuthEnabled } from "@/lib/dev-auth";
import { supabasePublicKey, supabaseUrl } from "@/lib/supabase/env";

const PUBLIC = ["/login", "/instalacion", "/api/cron", "/api/mantenimiento"];

/** Refresca la sesión y manda al login a quien no ha entrado. La autorización real se hace en el servidor. */
export async function proxy(request: NextRequest) {
  const path0 = request.nextUrl.pathname;
  if (devAuthEnabled()) {
    if (!request.cookies.get(DEV_COOKIE) && !PUBLIC.some((p) => path0.startsWith(p))) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next({ request });
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl(), supabasePublicKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!data.user && !PUBLIC.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
