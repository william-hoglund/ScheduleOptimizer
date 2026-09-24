import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Where email confirmation and password-recovery links land.
 *
 * Supabase sends a one-time `code`; exchanging it sets the session cookies.
 */

/**
 * Only same-site, path-only redirects are allowed.
 *
 * Without this check, `/auth/callback?next=https://evil.example` would bounce a
 * freshly-authenticated student straight to an attacker's page — the classic
 * open-redirect used to make phishing links look legitimate. `//evil.example`
 * is rejected too, since browsers read that as protocol-relative.
 */
function safeRedirectPath(next: string | null): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=expired_link`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=expired_link`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
