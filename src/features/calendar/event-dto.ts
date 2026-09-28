import type { CalendarEventRow } from "@/lib/supabase/types";

/**
 * What the calendar needs to draw one event.
 *
 * Kept out of actions.ts because a "use server" module may only export async
 * functions — a plain helper there is a build error.
 */
export type CalendarEventDto = {
  id: string;
  title: string;
  startIso: string;
  endIso: string;
  eventType: CalendarEventRow["event_type"];
  courseId: string | null;
  location: string | null;
  description: string | null;
  isFixed: boolean;
  source: CalendarEventRow["source"];
  /** Which imported calendar it belongs to. Null for manual events. */
  sourceId: string | null;
  isAllDay: boolean;
};

export function toCalendarEventDto(row: CalendarEventRow): CalendarEventDto {
  return {
    id: row.id,
    title: row.title,
    startIso: row.start_at,
    endIso: row.end_at,
    eventType: row.event_type,
    courseId: row.course_id,
    location: row.location,
    description: row.description,
    isFixed: row.is_fixed,
    source: row.source,
    sourceId: row.source_id,
    isAllDay: row.is_all_day,
  };
}
