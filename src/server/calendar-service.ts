import "server-only";

import { wallClockToUtc } from "@/lib/calendar/time";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CalendarEventRow } from "@/lib/supabase/types";
import type { CalendarEventInput } from "@/lib/validation/calendar-event";

/** Calendar events. The only place the `calendar_events` table is touched. */

function emptyToNull(value: string | null): string | null {
  return value === null || value.trim() === "" ? null : value;
}

/**
 * The schema already guarantees the "YYYY-MM-DDTHH:MM" shape, so a failure here
 * means validation and storage have drifted apart. Throwing beats writing a
 * null into a NOT NULL column and getting a confusing constraint error.
 */
function requireInstant(local: string, timeZone: string, field: string): string {
  const instant = wallClockToUtc(local, timeZone);
  if (!instant) {
    throw new Error(`Could not interpret ${field} ("${local}") in ${timeZone}.`);
  }
  return instant;
}

function toRow(input: CalendarEventInput, timeZone: string) {
  return {
    title: input.title,
    course_id: emptyToNull(input.courseId),
    event_type: input.eventType,
    description: emptyToNull(input.description),
    location: emptyToNull(input.location),
    start_at: requireInstant(input.startLocal, timeZone, "start"),
    end_at: requireInstant(input.endLocal, timeZone, "end"),
    // Recorded so the event can still be rendered correctly if the student
    // later changes their profile timezone.
    timezone: timeZone,
    is_fixed: input.isFixed,
  };
}

/**
 * Events overlapping a window. Uses overlap rather than containment, so a
 * lecture that starts before the visible range and ends inside it still shows.
 */
export async function listCalendarEvents(
  userId: string,
  rangeStartIso: string,
  rangeEndIso: string,
): Promise<CalendarEventRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("user_id", userId)
    .lt("start_at", rangeEndIso)
    .gt("end_at", rangeStartIso)
    .order("start_at", { ascending: true });

  if (error) throw new Error(`Could not load calendar events: ${error.message}`);
  return data ?? [];
}

export async function createCalendarEvent(
  userId: string,
  input: CalendarEventInput,
  timeZone: string,
): Promise<CalendarEventRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("calendar_events")
    .insert({ user_id: userId, source: "manual", ...toRow(input, timeZone) })
    .select("*")
    .single();

  if (error) throw new Error(`Could not save event: ${error.message}`);
  return data;
}

export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  input: CalendarEventInput,
  timeZone: string,
): Promise<CalendarEventRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("calendar_events")
    .update(toRow(input, timeZone))
    .eq("id", eventId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(`Could not update event: ${error.message}`);
  return data;
}

/** Moving or resizing by drag. Times arrive as absolute instants already. */
export async function moveCalendarEvent(
  userId: string,
  eventId: string,
  startIso: string,
  endIso: string,
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("calendar_events")
    .update({ start_at: startIso, end_at: endIso })
    .eq("id", eventId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not move event: ${error.message}`);
}

export async function deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", eventId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not delete event: ${error.message}`);
}
