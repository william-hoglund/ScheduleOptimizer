import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/types";

/**
 * The only place profile rows are read or written.
 *
 * Components never query the database directly — they call through here, so
 * there is exactly one definition of what "the current profile" means.
 */

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load profile: ${error.message}`);
  }

  return data;
}

export async function updateProfile(
  userId: string,
  changes: Partial<
    Pick<
      ProfileRow,
      | "full_name"
      | "timezone"
      | "locale"
      | "segment"
      | "onboarding_step"
      | "onboarding_completed"
    >
  >,
): Promise<ProfileRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .update(changes)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Could not update profile: ${error.message}`);
  }

  return data;
}
