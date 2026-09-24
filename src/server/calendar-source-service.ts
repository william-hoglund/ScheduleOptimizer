import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CalendarSourceRow } from "@/lib/supabase/types";
import type { CalendarSourceInput } from "@/lib/validation/calendar-source";

/**
 * Imported calendars. The only place `calendar_sources` is touched.
 *
 * One row per feed: a timetable per programme, a work calendar, whatever else.
 * Two things follow from having them at all — events can be told apart, and a
 * calendar can carry a rule about what a day full of it does to studying.
 */

export type CalendarSourceWithCount = CalendarSourceRow & { eventCount: number };

function toRow(input: CalendarSourceInput) {
  return {
    name: input.name,
    kind: input.kind,
    day_effect: input.dayEffect,
    day_effect_threshold_minutes: input.thresholdMinutes,
    reduced_daily_minutes: input.reducedDailyMinutes,
  };
}

export async function listCalendarSources(userId: string): Promise<CalendarSourceWithCount[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("calendar_sources")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load calendars: ${error.message}`);

  const sources = data ?? [];
  if (sources.length === 0) return [];

  // One extra query rather than one per calendar: a student has a handful of
  // these, and N+1 queries for a count is how a settings page gets slow.
  const { data: events, error: countError } = await supabase
    .from("calendar_events")
    .select("source_id")
    .eq("user_id", userId)
    .not("source_id", "is", null);

  if (countError) throw new Error(`Could not count calendar events: ${countError.message}`);

  const counts = new Map<string, number>();
  for (const row of events ?? []) {
    if (row.source_id) counts.set(row.source_id, (counts.get(row.source_id) ?? 0) + 1);
  }

  return sources.map((source) => ({ ...source, eventCount: counts.get(source.id) ?? 0 }));
}

export async function createCalendarSource(
  userId: string,
  input: CalendarSourceInput,
  importUrl: string | null,
): Promise<CalendarSourceRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("calendar_sources")
    .insert({ user_id: userId, import_url: importUrl, ...toRow(input) })
    .select("*")
    .single();

  if (error) throw new Error(`Could not create the calendar: ${error.message}`);
  return data;
}

export async function updateCalendarSource(
  userId: string,
  sourceId: string,
  input: CalendarSourceInput,
): Promise<CalendarSourceRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("calendar_sources")
    .update(toRow(input))
    .eq("id", sourceId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(`Could not update the calendar: ${error.message}`);
  return data;
}

export async function markImported(userId: string, sourceId: string, nowIso: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("calendar_sources")
    .update({ last_imported_at: nowIso })
    .eq("id", sourceId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not record the import: ${error.message}`);
}

/**
 * Removing a calendar, with or without its events.
 *
 * The database has `on delete set null`, so deleting the row alone orphans the
 * events rather than destroying a term of lectures. Taking the events too is a
 * separate, deliberate choice the student makes in the confirmation.
 */
export async function deleteCalendarSource(
  userId: string,
  sourceId: string,
  { withEvents }: { withEvents: boolean },
): Promise<{ deletedEvents: number }> {
  const supabase = await createServerSupabaseClient();

  let deletedEvents = 0;

  if (withEvents) {
    const { data, error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("user_id", userId)
      .eq("source_id", sourceId)
      .select("id");

    if (error) throw new Error(`Could not remove the calendar's events: ${error.message}`);
    deletedEvents = data?.length ?? 0;
  }

  const { error } = await supabase
    .from("calendar_sources")
    .delete()
    .eq("id", sourceId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not remove the calendar: ${error.message}`);
  return { deletedEvents };
}
