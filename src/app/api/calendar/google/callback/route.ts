import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { requireUser } from "@/server/auth";
import {
  exchangeCodeForTokens,
  GOOGLE_OAUTH_STATE_COOKIE,
  isGoogleCalendarEnabled,
} from "@/server/google-calendar-service";
import { upsertGoogleConnection } from "@/server/google-connection-service";

/**
 * Step 2: Google sends the student back here with a one-time code (or an
 * error, if they declined).
 *
 * The state cookie set in `connect/route.ts` must come back unchanged in the
 * query string — if it doesn't, this is not a continuation of a flow we
 * started, and nothing is exchanged.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  const { searchParams, origin } = new URL(request.url);

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  function done(status: "connected" | "error", detail?: string) {
    const url = new URL("/import-export", origin);
    url.searchParams.set("google", status);
    if (detail) url.searchParams.set("googleError", detail);

    const response = NextResponse.redirect(url);
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  }

  if (!isGoogleCalendarEnabled()) return done("error", "notConfigured");

  if (searchParams.get("error")) return done("error", "denied");

  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  if (!code || !expectedState || returnedState !== expectedState) {
    return done("error", "invalidState");
  }

  try {
    const { tokens, externalAccountId } = await exchangeCodeForTokens(code);
    await upsertGoogleConnection(user.id, externalAccountId, tokens);
  } catch (cause) {
    console.error("[google-calendar] connect failed:", cause);
    return done("error", "unexpected");
  }

  revalidatePath("/import-export");
  return done("connected");
}
