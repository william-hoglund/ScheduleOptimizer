import type { ParsedIcsEvent } from "./ics-parse";
import { classifyEventType, cleanImportedTitle, extractCourseCode } from "./subject-heuristics";
import type { EventType } from "@/lib/supabase/types";

/**
 * A parsed VEVENT turned into something this product understands: a titled,
 * typed, course-tagged event the student can review before it is saved.
 *
 * Still pure. Nothing here decides to write anything.
 */

export type ImportCandidate = {
  /**
   * What goes in `calendar_events.external_event_id`, so re-importing the same
   * feed recognises what is already there rather than duplicating it.
   *
   * Occurrences of a recurring event all share one UID, so the start instant is
   * appended for those — the column is unique per (user, source, external id).
   */
  externalId: string;
  title: string;
  startIso: string;
  endIso: string;
  isAllDay: boolean;
  location: string | null;
  description: string | null;
  eventType: EventType;
  /** A course code found in the title, for matching against the student's courses. */
  courseCode: string | null;
};

/** Enough to tell two events apart when the feed gave no UID at all. */
function derivedId(event: ParsedIcsEvent): string {
  let hash = 2166136261;
  for (const char of `${event.summary}|${event.startIso}|${event.endIso}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `derived-${(hash >>> 0).toString(36)}`;
}

function externalIdFor(event: ParsedIcsEvent): string {
  const base = event.uid ?? derivedId(event);
  return event.fromRecurrence ? `${base}::${event.startIso}` : base;
}

export function toImportCandidate(event: ParsedIcsEvent): ImportCandidate {
  const title = cleanImportedTitle(event.summary);
  const searchable = `${event.summary} ${event.description ?? ""}`;

  return {
    externalId: externalIdFor(event),
    // A feed with no SUMMARY is rare but legal, and the database rejects a blank
    // title. "Untitled" is honest and still editable afterwards.
    title: title || "Untitled event",
    startIso: event.startIso,
    endIso: event.endIso,
    isAllDay: event.isAllDay,
    location: event.location,
    description: event.description,
    eventType: classifyEventType(searchable),
    courseCode: extractCourseCode(searchable),
  };
}

export function toImportCandidates(events: readonly ParsedIcsEvent[]): ImportCandidate[] {
  return events.map(toImportCandidate);
}
