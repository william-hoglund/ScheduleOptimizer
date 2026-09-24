import "server-only";

import {
  isSelectedByDefault,
  reviewImport,
  type ReviewCandidate,
} from "@/lib/calendar/detect-duplicates";
import { findClashes } from "@/lib/calendar/detect-clashes";
import { parseIcs, type IcsWarning } from "@/lib/calendar/ics-parse";
import { toImportCandidates, type ImportCandidate } from "@/lib/calendar/normalize-event";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CourseRow } from "@/lib/supabase/types";
import { MAX_IMPORT_EVENTS, type ImportSelection } from "@/lib/validation/import-export";
import { listCourses } from "./course-service";

/**
 * Turning an `.ics` file into a reviewable list, and then into rows.
 *
 * The rule this service exists to enforce: **nothing is written until the
 * student has seen it.** Parsing produces a preview; a second, explicit call
 * saves the subset they ticked. An import that quietly rewrote someone's
 * calendar would be impossible to trust and hard to undo.
 */

export type ImportPreviewRow = ReviewCandidate & {
  courseId: string | null;
  courseName: string | null;
  selectedByDefault: boolean;
  /** Events already on the calendar that this one collides with. */
  clashesWith: { id: string; title: string; startIso: string }[];
};

export type ImportPreview = {
  calendarName: string | null;
  rows: ImportPreviewRow[];
  warnings: IcsWarning[];
  counts: { total: number; new: number; duplicate: number; clashing: number };
};

/** Course codes are written inconsistently ("tddd86", "TDDD-86"); this is not. */
function codeKey(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function courseIndex(courses: readonly CourseRow[]): Map<string, CourseRow> {
  const index = new Map<string, CourseRow>();
  for (const course of courses) {
    if (course.code) index.set(codeKey(course.code), course);
  }
  return index;
}

/**
 * Events already on the calendar in the window the import covers.
 *
 * Only that window: an import of one term should not read a student's entire
 * calendar history to find out whether a lecture in September is new.
 */
async function loadExistingInWindow(userId: string, startIso: string, endIso: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, external_event_id, source_id, title, start_at, end_at, is_fixed, is_all_day")
    .eq("user_id", userId)
    .lt("start_at", endIso)
    .gt("end_at", startIso);

  if (error) throw new Error(`Could not check for existing events: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    externalEventId: row.external_event_id,
    sourceId: row.source_id,
    title: row.title,
    startIso: row.start_at,
    endIso: row.end_at,
    isFixed: row.is_fixed,
    isAllDay: row.is_all_day,
  }));
}

type ExistingRow = Awaited<ReturnType<typeof loadExistingInWindow>>[number];

/**
 * Which incoming events collide with something already on the calendar.
 *
 * Both sides go through the same pure `findClashes`, so an incoming lecture and
 * an existing one are judged by exactly the rule the calendar view uses. Events
 * this import would *replace* are skipped: an event does not clash with itself.
 */
function clashesForCandidates(
  candidates: readonly ImportCandidate[],
  existing: readonly ExistingRow[],
  targetSourceId: string | null,
): Map<string, { id: string; title: string; startIso: string }[]> {
  const replacedIds = new Set(
    existing
      .filter((row) => row.sourceId === targetSourceId && row.externalEventId)
      .map((row) => row.id),
  );

  const incoming = candidates.map((candidate) => ({
    id: `incoming:${candidate.externalId}`,
    title: candidate.title,
    startIso: candidate.startIso,
    endIso: candidate.endIso,
    sourceId: targetSourceId,
    // Imported timetable entries are commitments; that is the whole point.
    isFixed: true,
    isAllDay: candidate.isAllDay,
  }));

  const settled = existing
    .filter((row) => !replacedIds.has(row.id))
    .map((row) => ({
      id: row.id,
      title: row.title,
      startIso: row.startIso,
      endIso: row.endIso,
      sourceId: row.sourceId,
      isFixed: row.isFixed,
      isAllDay: row.isAllDay,
    }));

  const byCandidate = new Map<string, { id: string; title: string; startIso: string }[]>();

  for (const clash of findClashes([...incoming, ...settled])) {
    for (const [side, other] of [
      [clash.first, clash.second],
      [clash.second, clash.first],
    ] as const) {
      if (!side.id.startsWith("incoming:") || other.id.startsWith("incoming:")) continue;

      const key = side.id.slice("incoming:".length);
      const list = byCandidate.get(key) ?? [];
      list.push({ id: other.id, title: other.title, startIso: other.startIso });
      byCandidate.set(key, list);
    }
  }

  return byCandidate;
}

export async function previewIcsImport(
  userId: string,
  timeZone: string,
  icsText: string,
  /** The calendar this import is going into, when it already exists. */
  targetSourceId: string | null = null,
): Promise<ImportPreview> {
  const parsed = parseIcs(icsText, { fallbackTimeZone: timeZone, maxEvents: MAX_IMPORT_EVENTS });
  const candidates = toImportCandidates(parsed.events);

  const [first] = candidates;
  if (!first) {
    return {
      calendarName: parsed.calendarName,
      rows: [],
      warnings: parsed.warnings,
      counts: { total: 0, new: 0, duplicate: 0, clashing: 0 },
    };
  }

  const windowStart = candidates.reduce(
    (min, c) => (c.startIso < min ? c.startIso : min),
    first.startIso,
  );
  const windowEnd = candidates.reduce(
    (max, c) => (c.endIso > max ? c.endIso : max),
    first.endIso,
  );

  const [existing, courses] = await Promise.all([
    loadExistingInWindow(userId, windowStart, windowEnd),
    listCourses(userId),
  ]);

  const byCode = courseIndex(courses);

  /**
   * Where two timetables collide.
   *
   * The whole point of importing a second programme is that nobody else knows
   * about the first, so a Tuesday clash is normal. The student has to pick one,
   * and can only do that if they are told.
   */
  const clashesByCandidate = clashesForCandidates(candidates, existing, targetSourceId);

  const rows = reviewImport(candidates, existing, targetSourceId).map((candidate) => {
    const course = candidate.courseCode ? byCode.get(codeKey(candidate.courseCode)) : undefined;

    return {
      ...candidate,
      courseId: course?.id ?? null,
      courseName: course?.name ?? null,
      selectedByDefault: isSelectedByDefault(candidate.status),
      clashesWith: clashesByCandidate.get(candidate.externalId) ?? [],
    };
  });

  return {
    calendarName: parsed.calendarName,
    rows,
    warnings: parsed.warnings,
    counts: {
      total: rows.length,
      new: rows.filter((row) => row.status === "new").length,
      duplicate: rows.filter((row) => row.status !== "new").length,
      clashing: rows.filter((row) => row.clashesWith.length > 0).length,
    },
  };
}

export type ImportOutcome = { inserted: number; updated: number };

/**
 * Write the reviewed selection.
 *
 * Rows the student ticked that already exist are **updated**, not inserted:
 * `calendar_events` has a unique index on (user, source, external id), so a
 * second insert of the same feed event would fail outright. Updating is also
 * what the student means by re-importing a corrected timetable.
 */
export async function saveImportedEvents(
  userId: string,
  timeZone: string,
  selections: readonly ImportSelection[],
  sourceId: string | null,
): Promise<ImportOutcome> {
  const supabase = await createServerSupabaseClient();

  const toInsert = selections.filter((selection) => selection.existingEventId === null);

  const asRow = (selection: ImportSelection) => ({
    title: selection.title,
    course_id: selection.courseId,
    event_type: selection.eventType,
    description: selection.description,
    location: selection.location,
    start_at: selection.startIso,
    end_at: selection.endIso,
    // Imported instants are absolute already; the zone is recorded so the event
    // still renders sensibly if the student later moves country.
    timezone: timeZone,
    is_fixed: selection.isFixed,
    is_all_day: selection.isAllDay,
  });

  let inserted = 0;

  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from("calendar_events")
      .insert(
        toInsert.map((selection) => ({
          user_id: userId,
          source: "ics" as const,
          source_id: sourceId,
          external_event_id: selection.externalId,
          ...asRow(selection),
        })),
      )
      .select("id");

    if (error) throw new Error(`Could not import events: ${error.message}`);
    inserted = data?.length ?? 0;
  }

  let updated = 0;

  // One statement per row, because each carries different values. The counts
  // are small — a re-import is normally a handful of changed lectures.
  for (const selection of selections) {
    const existingId = selection.existingEventId;
    if (!existingId) continue;

    const { error } = await supabase
      .from("calendar_events")
      .update({ ...asRow(selection), source_id: sourceId })
      .eq("id", existingId)
      .eq("user_id", userId);

    if (error) throw new Error(`Could not update an imported event: ${error.message}`);
    updated += 1;
  }

  return { inserted, updated };
}
