import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * "Give me everything you hold about me."
 *
 * GDPR Article 20 (portability) and Article 15 (access). Both are answered by
 * the same thing: a complete, machine-readable copy of the student's own rows.
 *
 * Read through the **normal** client, not the service-role one. Row Level
 * Security then guarantees the export can only ever contain the caller's own
 * data — the export cannot become a way to read someone else's, even if the
 * query were wrong.
 */

/**
 * Tables that hold the student's own data, in the order a person would read
 * them: who they are, what they study, what they planned, what happened.
 *
 * `calendar_connections` is deliberately absent. Its RLS denies the browser
 * outright because it holds OAuth tokens, and a "portable copy" of an access
 * token is a liability, not a right — the export says so in `notes` instead of
 * quietly omitting it.
 */
const EXPORTED_TABLES = [
  "profiles",
  "institutions",
  "programs",
  "courses",
  "tasks",
  "task_dependencies",
  "calendar_sources",
  "calendar_events",
  "study_preferences",
  "availability_rules",
  "study_plans",
  "study_sessions",
  "planner_runs",
  "notifications",
  "notification_settings",
  "user_consents",
  "audit_log",
  "study_group_members",
  "study_group_scores",
] as const;

export type AccountExport = {
  format: number;
  exportedAt: string;
  account: { id: string; email: string | null };
  notes: string[];
  data: Record<string, unknown[]>;
  /** Tables that could not be read, rather than a silently short export. */
  unavailable: string[];
};

export async function exportAccountData(
  userId: string,
  email: string | null,
  nowIso: string,
): Promise<AccountExport> {
  const supabase = await createServerSupabaseClient();

  const data: Record<string, unknown[]> = {};
  const unavailable: string[] = [];

  for (const table of EXPORTED_TABLES) {
    /**
     * One cast, at the one place it is unavoidable: `table` is a union of every
     * table name, so the generated types collapse the column argument to
     * `never` and no string can satisfy it. The shape asserted here is exactly
     * what PostgREST returns.
     */
    const query = supabase.from(table).select("*") as unknown as {
      eq: (
        column: string,
        value: string,
      ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };

    // `profiles` keys on `id`; every other table has a `user_id`. RLS filters
    // to the caller anyway — this is belt and braces, and it keeps the query
    // cheap on tables that are large for everyone.
    const { data: rows, error } = await query.eq(table === "profiles" ? "id" : "user_id", userId);

    if (error) {
      // One missing table must not cost the student the other seventeen.
      console.error(`[export] ${table}: ${error.message}`);
      unavailable.push(table);
      continue;
    }

    data[table] = rows ?? [];
  }

  return {
    format: 1,
    exportedAt: nowIso,
    account: { id: userId, email },
    notes: [
      "Every row here belongs to this account. Times are UTC (ISO 8601); the timezone your schedule is shown in is on your profile.",
      "Connected calendar accounts are not included: that record holds access tokens, which are encrypted and never readable by the browser. Disconnecting is done in the app.",
    ],
    data,
    unavailable,
  };
}
