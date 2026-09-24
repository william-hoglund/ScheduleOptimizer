import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { clientEnv } from "@/lib/env";

/**
 * Runs before every matched request. In Next.js 16 this file used to be called
 * `middleware.ts`; the name changed, the behaviour did not.
 *
 * It does two things:
 *
 *  1. **Refreshes the Supabase session.** Access tokens are short-lived. Without
 *     a refresh on each request, a student gets silently signed out mid-session.
 *     Server Components cannot write cookies, so this is the one place the
 *     rotated token can be persisted.
 *
 *  2. **Redirects optimistically.** Signed-out visitors heading for the app get
 *     sent to /login, and signed-in ones get bounced off /login and /register.
 *
 * Point 2 is a convenience, NOT the security boundary. Next's own documentation
 * warns against treating proxy as an authorisation layer. The authoritative
 * check is `requireUser()` in the dashboard layout, backed by Row Level
 * Security in the database — so even if this file were bypassed entirely, no
 * data would leak.
 */

const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/calendar",
  "/courses",
  "/deadlines",
  "/todos",
  "/planner",
  "/insights",
  "/import-export",
  "/settings",
  "/onboarding",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // These are no-store / no-cache headers. A response that sets auth
          // cookies must never be cached by a CDN, or one student's session
          // token could be handed to the next visitor.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // getUser() revalidates the token against Supabase. getSession() only reads
  // the cookie, which a client could have forged, so it must not be trusted here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    // Remember where they were going so sign-in can return them there.
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Running the session
     * refresh on every icon request would be pure waste.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
