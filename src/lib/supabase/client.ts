import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env";
import type { Database } from "./types";

/**
 * Supabase client for Client Components.
 *
 * Uses the anon key, which is public by design — every query it makes is
 * filtered by Row Level Security, so this client can only ever see the signed-in
 * student's own rows.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
