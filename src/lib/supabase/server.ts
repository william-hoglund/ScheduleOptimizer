import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { clientEnv } from "@/lib/env";
import type { Database } from "./types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Still the anon key — Row Level Security is what protects the data, and using
 * the anon key server-side means a bug in a query cannot leak another student's
 * rows. Reach for the admin client only where bypassing RLS is the point.
 */
export async function createServerSupabaseClient() {
  // Async in Next.js 16; synchronous access was removed.
  const cookieStore = await cookies();

  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. That is fine: proxy.ts
            // refreshes the session on every request, so the only thing lost
            // here is a redundant write.
          }
        },
      },
    },
  );
}
