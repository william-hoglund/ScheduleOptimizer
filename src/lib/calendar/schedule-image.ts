import { wallClockToUtc } from "./time";
import type { ImportCandidate } from "./normalize-event";
import type { ExtractedScheduleEntry, WeekdayName } from "@/lib/ai";

/** `WeekdayName` -> JS `Date#getDay()` index (0=Sunday..6=Saturday). */
const WEEKDAY_INDEX: Record<WeekdayName, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Turning what the AI read off a timetable photo into the same
 * `ImportCandidate` shape an `.ics` VEVENT or a Google event produces — so
 * duplicate detection, course matching, clash detection and the review
 * screen are all already written and already tested.
 *
 * Pure, like `google-event.ts`. The one genuinely new idea here: a
 * photographed timetable is normally a *weekly pattern*
 * (`ExtractedScheduleEntry.dayOfWeek`), not a list of dates, so this is also
 * where that pattern becomes real calendar instants — the one expansion job
 * nothing else in the app already does, because `.ics` recurrence
 * (`ics-parse.ts`) and this have no code in common: an RRULE is read off the
 * feed itself, this is chosen by the student on the review screen.
 */

export type ScheduleImageDateRange = { startDate: string; endDate: string };

/** A hard ceiling so a wide date range times a weekly pattern cannot runway. */
const MAX_OCCURRENCES_PER_ENTRY = 60;

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** Every date in `range` (inclusive) that falls on `dayOfWeek` (0=Sunday..6=Saturday). */
function datesForWeekday(range: ScheduleImageDateRange, dayOfWeek: number): string[] {
  if (range.endDate < range.startDate) return [];

  let cursor = range.startDate;
  while (weekdayOf(cursor) !== dayOfWeek) {
    cursor = addDays(cursor, 1);
    if (cursor > range.endDate) return [];
  }

  const dates: string[] = [];
  while (cursor <= range.endDate && dates.length < MAX_OCCURRENCES_PER_ENTRY) {
    dates.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return dates;
}

function toCandidate(
  entry: ExtractedScheduleEntry,
  date: string,
  timeZone: string,
  externalId: string,
): ImportCandidate | null {
  // A time the model couldn't read is honestly "we don't know when", not
  // midnight — shown as an all-day entry rather than a fabricated clock time,
  // the same choice `.ics` makes for a VEVENT with no DTSTART time component.
  const isAllDay = !entry.startTime || !entry.endTime;

  const startIso = isAllDay
    ? wallClockToUtc(`${date}T00:00`, timeZone)
    : wallClockToUtc(`${date}T${entry.startTime}`, timeZone);
  const endIso = isAllDay
    ? wallClockToUtc(`${addDays(date, 1)}T00:00`, timeZone)
    : wallClockToUtc(`${date}T${entry.endTime}`, timeZone);

  if (!startIso || !endIso) return null;
  // A model-misread end-before-start ("13:00"-"09:00") is not worth guessing
  // a fix for — drop it, same as a genuinely backwards `.ics` DTEND/DTSTART.
  if (Date.parse(endIso) <= Date.parse(startIso)) return null;

  // The model occasionally emits the literal text "null" instead of an
  // actual null for a field it couldn't read, rather than honouring the
  // schema's nullability — seen in practice on `courseCode`. Treat it the
  // same as a real null rather than importing "null" as someone's course code.
  const courseCode =
    entry.courseCode && entry.courseCode.trim().toLowerCase() !== "null" ? entry.courseCode : null;

  return {
    externalId,
    title: entry.title.trim() || "Untitled event",
    startIso,
    endIso,
    isAllDay,
    location: entry.location,
    description: null,
    eventType: entry.eventType,
    courseCode,
  };
}

/**
 * `entries` as extracted, `range` as the student picked on the review
 * screen (the image itself names no year). A `dayOfWeek` entry becomes one
 * candidate per matching date in range; a `date` entry becomes exactly one,
 * using its own date regardless of range — it is not a pattern to repeat.
 */
export function toImportCandidates(
  entries: readonly ExtractedScheduleEntry[],
  range: ScheduleImageDateRange,
  timeZone: string,
): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];

  entries.forEach((entry, entryIndex) => {
    const dates = entry.date
      ? [entry.date]
      : entry.dayOfWeek !== null
        ? datesForWeekday(range, WEEKDAY_INDEX[entry.dayOfWeek])
        : [];

    for (const date of dates) {
      const candidate = toCandidate(entry, date, timeZone, `schedule-image:${entryIndex}:${date}`);
      if (candidate) candidates.push(candidate);
    }
  });

  return candidates;
}
