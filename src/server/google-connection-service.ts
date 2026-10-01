import "server-only";

import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { CalendarConnectionRow } from "@/lib/supabase/types";

/**
 * Reading and writing `calendar_connections`.
 *
 * The only place this table is touched. Its RLS has no policy for
 * `authenticated` at all (see supabase/migrations/0003_calendar.sql) — the
 * browser cannot read a Google refresh token even as its own owner, so this
 * service always goes through the admin client and filters by `user_id` by
 * hand on every query, exactly as that migration's own comment requires.
 */

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string | null;
  /** ISO instant — matches `calendar_connections.expires_at` (timestamptz). */
  expiresAt: string;
};

export type GoogleConnectionStatus = {
  connected: boolean;
  externalAccountId: string | null;
  syncStatus: CalendarConnectionRow["sync_status"] | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export async function getGoogleConnectionStatus(userId: string): Promise<GoogleConnectionStatus> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("calendar_connections")
    .select("external_account_id, sync_status, last_synced_at, last_error")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  if (error) throw new Error(`Could not load the Google connection: ${error.message}`);
  if (!data) return { connected: false, externalAccountId: null, syncStatus: null, lastSyncedAt: null, lastError: null };

  return {
    connected: true,
    externalAccountId: data.external_account_id,
    syncStatus: data.sync_status,
    lastSyncedAt: data.last_synced_at,
    lastError: data.last_error,
  };
}

/**
 * The decrypted tokens for a sync call. Returns `null` when there is no
 * connection — the caller decides what that means (hidden panel, refused
 * sync, etc.), this module only ever hands back real tokens or nothing.
 */
export async function getGoogleTokens(
  userId: string,
): Promise<(GoogleTokens & { connectionId: string }) | null> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("calendar_connections")
    .select("id, access_token_encrypted, refresh_token_encrypted, expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  if (error) throw new Error(`Could not load Google tokens: ${error.message}`);
  if (!data || !data.access_token_encrypted || !data.expires_at) return null;

  return {
    connectionId: data.id,
    accessToken: decryptToken(data.access_token_encrypted),
    refreshToken: data.refresh_token_encrypted ? decryptToken(data.refresh_token_encrypted) : null,
    expiresAt: data.expires_at,
  };
}

/**
 * Create or update the one Google connection a student can have.
 *
 * `onConflict` on (user_id, provider, external_account_id) — the same
 * database guarantee `confirmIcsImport` leans on for calendars — so
 * reconnecting the same Google account updates its tokens in place rather
 * than creating a second row.
 */
export async function upsertGoogleConnection(
  userId: string,
  externalAccountId: string,
  tokens: GoogleTokens,
): Promise<void> {
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase.from("calendar_connections").upsert(
    {
      user_id: userId,
      provider: "google",
      external_account_id: externalAccountId,
      access_token_encrypted: encryptToken(tokens.accessToken),
      // A refresh happens without a new refresh token most of the time — only
      // overwrite when Google actually sent one, never wipe a working one out.
      ...(tokens.refreshToken ? { refresh_token_encrypted: encryptToken(tokens.refreshToken) } : {}),
      expires_at: tokens.expiresAt,
      sync_status: "pending",
      last_error: null,
    },
    { onConflict: "user_id,provider,external_account_id" },
  );

  if (error) throw new Error(`Could not save the Google connection: ${error.message}`);
}

export async function recordGoogleSyncResult(
  connectionId: string,
  result: { ok: true } | { ok: false; error: string },
): Promise<void> {
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase
    .from("calendar_connections")
    .update(
      result.ok
        ? { sync_status: "active", last_synced_at: new Date().toISOString(), last_error: null }
        : { sync_status: "error", last_error: result.error },
    )
    .eq("id", connectionId);

  if (error) throw new Error(`Could not record the sync result: ${error.message}`);
}

export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase
    .from("calendar_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "google");

  if (error) throw new Error(`Could not disconnect Google Calendar: ${error.message}`);
}
