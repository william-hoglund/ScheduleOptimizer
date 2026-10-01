import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { requireUser } from "@/server/auth";
import {
  buildGoogleAuthUrl,
  GOOGLE_OAUTH_STATE_COOKIE,
  isGoogleCalendarEnabled,
} from "@/server/google-calendar-service";

/**
 * Step 1 of connecting Google Calendar: send the student to Google's own
 * consent screen.
 *
 * A plain `<a>` to this route, not a fetch — the browser has to actually
 * navigate to accounts.google.com, the same way an export download has to
 * actually be a download (see export-panel.tsx).
 */

export async function GET(request: Request) {
  // Redirects to /login itself if nobody is signed in.
  await requireUser();

  if (!isGoogleCalendarEnabled()) {
    return NextResponse.redirect(new URL("/import-export?google=error&googleError=notConfigured", request.url));
  }

  // A random value the callback must see echoed back unchanged — the
  // standard OAuth defence against a forged callback request. 24 bytes is
  // comfortably beyond brute-forcing within the cookie's 10-minute life.
  const state = randomBytes(24).toString("base64url");

  const response = NextResponse.redirect(buildGoogleAuthUrl(state));
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/calendar/google",
  });

  return response;
}
