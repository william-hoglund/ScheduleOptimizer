import "server-only";

import {
  toImportCandidates as toGoogleImportCandidates,
  type GoogleEvent,
} from "@/lib/calendar/google-event";
import { addMinutes } from "@/lib/calendar/time";
import type { ImportCandidate } from "@/lib/calendar/normalize-event";
import { getServerEnv } from "@/lib/env";
import { nowIso } from "./clock";
import {
  getGoogleTokens,
  upsertGoogleConnection,
  type GoogleTokens,
} from "./google-connection-service";

/**
 * Talking to Google: the OAuth dance and the Calendar API read.
 *
 * One-way, read-only sync — the brief's own words (PLAN.md §7, Session 11).
 * This module never writes to Google and asks only for
 * `calendar.readonly`. Everything it returns still goes through the exact
 * same preview-then-confirm pipeline as an `.ics` import (see
 * `previewGoogleSync` in import-service.ts) — nothing is saved just because
 * Google said so.
 */

/**
 * The cookie carrying the OAuth CSRF state between `connect/route.ts` and
 * `callback/route.ts`. Named here, not in either route file, because a Next.js
 * `route.ts` may only export HTTP method handlers and a small set of reserved
 * config names — an arbitrary extra export there is a build-time route-type
 * error, not just unconventional.
 */
export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const TIMEOUT_MS = 12_000;

// How far the sync window reaches. A week back catches something just missed;
// two months forward is enough to matter to the planner without pulling a
// student's entire calendar history on every sync.
const WINDOW_BACK_DAYS = 7;
const WINDOW_FORWARD_DAYS = 60;

export function isGoogleCalendarEnabled(): boolean {
  const env = getServerEnv();
  return Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI && env.ENCRYPTION_KEY,
  );
}

function requireConfig() {
  const env = getServerEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new Error("Google Calendar is not configured. Set GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI.");
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  };
}

export function buildGoogleAuthUrl(state: string): string {
  const { clientId, redirectUri } = requireConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // Forces Google to hand back a refresh_token even if this student
    // authorized before — without it, a second consent returns none.
    prompt: "consent",
    state,
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

function tokensFromResponse(body: TokenResponse, previousRefreshToken: string | null): GoogleTokens {
  return {
    accessToken: body.access_token,
    // A refresh call usually omits refresh_token; keep the one already on
    // file rather than losing the ability to refresh again later.
    refreshToken: body.refresh_token ?? previousRefreshToken,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
  };
}

async function postToTokenEndpoint(params: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google token request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  return response.json() as Promise<TokenResponse>;
}

/** The authorization code from the callback → tokens, plus which account. */
export async function exchangeCodeForTokens(
  code: string,
): Promise<{ tokens: GoogleTokens; externalAccountId: string }> {
  const { clientId, clientSecret, redirectUri } = requireConfig();

  const body = await postToTokenEndpoint(
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );

  const tokens = tokensFromResponse(body, null);
  const externalAccountId = await fetchPrimaryCalendarId(tokens.accessToken);

  return { tokens, externalAccountId };
}

async function refreshTokens(refreshToken: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = requireConfig();

  const body = await postToTokenEndpoint(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  );

  return tokensFromResponse(body, refreshToken);
}

/** The student's own calendar id (their email) — stable, good as an account key. */
async function fetchPrimaryCalendarId(accessToken: string): Promise<string> {
  const response = await fetch(`${CALENDAR_API}/calendars/primary`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Could not read the Google account's primary calendar.`);

  const data = (await response.json()) as { id: string };
  return data.id;
}

export type GoogleAccessError = "notConnected" | "revoked" | "unexpected";

/**
 * A usable access token for this student's connection, refreshing first if
 * it is expired or about to be. Never throws for the ordinary "not connected"
 * or "revoked" cases — those are situations the caller shows, not bugs.
 */
export async function ensureFreshAccessToken(
  userId: string,
): Promise<{ ok: true; accessToken: string; connectionId: string } | { ok: false; error: GoogleAccessError }> {
  const existing = await getGoogleTokens(userId);
  if (!existing) return { ok: false, error: "notConnected" };

  // A minute of slack so a token that is about to expire mid-request still
  // gets refreshed now rather than failing partway through a sync.
  const expiresSoon = new Date(existing.expiresAt).getTime() - Date.now() < 60_000;
  if (!expiresSoon) return { ok: true, accessToken: existing.accessToken, connectionId: existing.connectionId };

  if (!existing.refreshToken) return { ok: false, error: "revoked" };

  try {
    const refreshed = await refreshTokens(existing.refreshToken);
    await upsertGoogleConnection(userId, await fetchPrimaryCalendarId(refreshed.accessToken), refreshed);
    return { ok: true, accessToken: refreshed.accessToken, connectionId: existing.connectionId };
  } catch {
    // Google returns invalid_grant for a revoked or expired refresh token —
    // the student disconnected from Google's side, not ours.
    return { ok: false, error: "revoked" };
  }
}

async function fetchEventsPage(
  accessToken: string,
  timeMinIso: string,
  timeMaxIso: string,
  pageToken: string | undefined,
): Promise<{ events: GoogleEvent[]; nextPageToken: string | undefined }> {
  const params = new URLSearchParams({
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  if (pageToken) params.set("pageToken", pageToken);

  const response = await fetch(`${CALENDAR_API}/calendars/primary/events?${params.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google Calendar read failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await response.json()) as { items: GoogleEvent[]; nextPageToken?: string };
  return { events: data.items ?? [], nextPageToken: data.nextPageToken };
}

// A hard ceiling on pages, mirroring MAX_IMPORT_EVENTS's spirit for `.ics`: a
// misbehaving account should hit a wall, not a long-running request.
const MAX_PAGES = 20;

async function fetchAllEvents(
  accessToken: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<GoogleEvent[]> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await fetchEventsPage(accessToken, timeMinIso, timeMaxIso, pageToken);
    events.push(...result.events);
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }

  return events;
}

export async function fetchGoogleImportCandidates(
  accessToken: string,
  timeZone: string,
): Promise<ImportCandidate[]> {
  const now = nowIso();
  const timeMinIso = addMinutes(now, -WINDOW_BACK_DAYS * 24 * 60);
  const timeMaxIso = addMinutes(now, WINDOW_FORWARD_DAYS * 24 * 60);

  const events = await fetchAllEvents(accessToken, timeMinIso, timeMaxIso);
  return toGoogleImportCandidates(events, timeZone);
}
