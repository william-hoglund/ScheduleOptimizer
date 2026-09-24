import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StudyPreferencesRow } from "@/lib/supabase/types";
import { defaultStudyPreferences, type StudyPreferencesInput } from "@/lib/validation/preferences";

/** Study preferences. Exactly one row per student, created on first save. */

export async function getStudyPreferences(userId: string): Promise<StudyPreferencesRow | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("study_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load study preferences: ${error.message}`);
  return data;
}

export async function saveStudyPreferences(
  userId: string,
  input: StudyPreferencesInput,
): Promise<StudyPreferencesRow> {
  const supabase = await createServerSupabaseClient();

  // upsert on user_id: the row may not exist yet during onboarding, and the
  // student may be editing it for the tenth time in settings. One code path.
  const { data, error } = await supabase
    .from("study_preferences")
    .upsert(
      {
        user_id: userId,
        minimum_session_minutes: input.minimumSessionMinutes,
        preferred_session_minutes: input.preferredSessionMinutes,
        maximum_session_minutes: input.maximumSessionMinutes,
        maximum_daily_minutes: input.maximumDailyMinutes,
        weekly_target_minutes: input.weeklyTargetMinutes,
        earliest_start_time: input.earliestStartTime,
        latest_end_time: input.latestEndTime,
        preferred_days: input.preferredDays,
        weekend_allowed: input.weekendAllowed,
        break_method: input.breakMethod,
        buffer_percentage: input.bufferPercentage,
        planning_flexibility: input.planningFlexibility,
        energy_profile: input.energyProfile,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error) throw new Error(`Could not save study preferences: ${error.message}`);
  return data;
}

/** Database row → form shape, falling back to the defaults for a new student. */
export function toPreferencesInput(row: StudyPreferencesRow | null): StudyPreferencesInput {
  if (!row) return defaultStudyPreferences;

  const energy = (row.energy_profile ?? {}) as Record<string, unknown>;
  const level = (value: unknown, fallback: "high" | "medium" | "low") =>
    value === "high" || value === "medium" || value === "low" ? value : fallback;

  return {
    minimumSessionMinutes: row.minimum_session_minutes,
    preferredSessionMinutes: row.preferred_session_minutes,
    maximumSessionMinutes: row.maximum_session_minutes,
    maximumDailyMinutes: row.maximum_daily_minutes,
    weeklyTargetMinutes: row.weekly_target_minutes,
    // Postgres returns "HH:MM:SS"; <input type="time"> wants "HH:MM".
    earliestStartTime: row.earliest_start_time.slice(0, 5),
    latestEndTime: row.latest_end_time.slice(0, 5),
    preferredDays: row.preferred_days,
    weekendAllowed: row.weekend_allowed,
    breakMethod: row.break_method,
    bufferPercentage: row.buffer_percentage,
    planningFlexibility: row.planning_flexibility,
    energyProfile: {
      morning: level(energy.morning, "high"),
      afternoon: level(energy.afternoon, "medium"),
      evening: level(energy.evening, "low"),
    },
  };
}
