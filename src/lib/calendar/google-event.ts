import { classifyEventType, cleanImportedTitle, extractCourseCode } from "./subject-heuristics";
import { wallClockToUtc } from "./time";
import type { ImportCandidate } from "./normalize-event";

/**
 * A Google Calendar API event → the same `ImportCandidate` shape an `.ics`
 * VEVENT produces, so everything downstream (duplicate detection, course
 * matching, the review screen) is already written and already tested.
 *
 * Pure, like `normalize-event.ts` — the actual HTTP call lives in
 * `server/google-calendar-service.ts`.
 */

export type GoogleEventTime = { date?: string; dateTime?: string };

export type GoogleEvent = {
  id: string;
  status: string;
  summary?: string;
  description?: string;
  location?: string;
  start: GoogleEventTime;
  end: GoogleEventTime;
};

/**
 * `null` for events this product has no use for: cancelled instances (Google
 * keeps a tombstone with `status: "cancelled"` rather than omitting them, so
 * skipping is correct, not a gap) and anything with no usable start or end —
 * which `singleEvents=true` should never produce, but a malformed instance is
 * not worth crashing a sync over.
 */
export function toImportCandidate(event: GoogleEvent, timeZone: string): ImportCandidate | null {
  if (event.status === "cancelled") return null;

  const toInstant = (time: GoogleEventTime): string | null => {
    if (time.dateTime) return time.dateTime;
    if (time.date) return wallClockToUtc(`${time.date}T00:00`, timeZone);
    return null;
  };

  const startIso = toInstant(event.start);
  const endIso = toInstant(event.end);
  if (!startIso || !endIso) return null;

  const title = cleanImportedTitle(event.summary ?? "");
  const searchable = `${event.summary ?? ""} ${event.description ?? ""}`;

  return {
    externalId: event.id,
    title: title || "Untitled event",
    startIso,
    // Google's own `end.date` on an all-day event is already the exclusive
    // boundary (the day after the last day) — the same convention `.ics`
    // DTEND uses, so no adjustment is needed here.
    endIso,
    isAllDay: Boolean(event.start.date),
    location: event.location ?? null,
    description: event.description ?? null,
    eventType: classifyEventType(searchable),
    courseCode: extractCourseCode(searchable),
  };
}

export function toImportCandidates(
  events: readonly GoogleEvent[],
  timeZone: string,
): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  for (const event of events) {
    const candidate = toImportCandidate(event, timeZone);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}
