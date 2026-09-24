import "server-only";

import { createClient } from "@supabase/supabase-js";

import { clientEnv, getServerEnv } from "@/lib/env";
import type { Database } from "./types";

/**
 * Supabase client using the service-role key.
 *
 * **This bypasses Row Level Security entirely.** It can read and write every
 * student's data. Use it only where that is genuinely required:
 *
 *   - scheduled jobs with no signed-in user (reminder dispatch)
 *   - reading and writing encrypted calendar tokens
 *   - GDPR account deletion across every table
 *
 * Never use it to "make a query work". If a normal query is being refused, the
 * RLS policy is wrong and should be fixed — reaching for this client instead
 * turns a policy bug into a data breach.
 *
 * The `server-only` import above makes importing this from a Client Component a
 * build error, so the key cannot reach the browser by accident.
 */
export function createAdminSupabaseClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local from " +
        "Supabase → Settings → API. It is only needed for scheduled jobs, " +
        "calendar tokens and account deletion.",
    );
  }

  return createClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      // No session to persist or refresh: this client acts as the system,
      // not as a user.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
