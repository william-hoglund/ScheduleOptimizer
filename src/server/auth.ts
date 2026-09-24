import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { defaultTimeZone } from "@/i18n/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProfile } from "./profile-service";

/**
 * The authoritative "is this person signed in?" check.
 *
 * `proxy.ts` also redirects unauthenticated visitors, but that is an optimistic
 * convenience. This runs inside the render, so it cannot be skipped by a
 * crafted request, and it is what every protected page must rely on.
 *
 * Uses getUser(), which verifies the token with Supabase, rather than
 * getSession(), which only decodes a cookie the client could have tampered with.
 */
export async function requireUser(): Promise<User> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

/**
 * The signed-in user plus the settings almost every action needs.
 *
 * Anything writing a timestamp needs the student's timezone to convert
 * wall-clock input correctly, so it is fetched once here rather than
 * rediscovered in each action.
 */
export async function requireUserContext(): Promise<{ user: User; timeZone: string }> {
  const user = await requireUser();
  const profile = await getProfile(user.id);

  return {
    user,
    timeZone: profile?.timezone || defaultTimeZone,
  };
}

/** Returns the signed-in user, or null. For pages that render either way. */
export async function getOptionalUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
