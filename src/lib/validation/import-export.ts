import { z } from "zod";

import { EVENT_TYPES } from "./calendar-event";
import { calendarSourceSchema } from "./calendar-source";
import { V } from "./messages";

/**
 * What the client may ask the server to import or export.
 *
 * The review screen holds parsed events in browser state and sends back the
 * ones the student ticked, so these are re-validated here before anything is
 * written — the server never trusts that what comes back is what it sent.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One row of the review table, as it comes back from the browser. */
export const importSelectionSchema = z.object({
  externalId: z.string().min(1).max(500),
  title: z.string().trim().min(1, V.required).max(200, V.nameTooLong),
  startIso: z.iso.datetime(),
  endIso: z.iso.datetime(),
  isAllDay: z.boolean(),
  location: z.string().trim().max(200, V.tooLong).nullable(),
  description: z.string().trim().max(2000, V.tooLong).nullable(),
  eventType: z.enum(EVENT_TYPES),
  courseId: z.uuid().nullable(),
  /** Fixed events are obstacles the planner must schedule around. */
  isFixed: z.boolean(),
  /** Set when this replaces a row that is already on the calendar. */
  existingEventId: z.uuid().nullable(),
});

export type ImportSelection = z.infer<typeof importSelectionSchema>;

/**
 * A cap on one import. Well past a full academic year of lectures, and low
 * enough that a malformed or hostile feed cannot be used to fill the database.
 */
export const MAX_IMPORT_EVENTS = 1000;

/**
 * Where an import lands.
 *
 * Either a calendar that already exists — re-importing an updated timetable —
 * or a new one described here, created as part of the same action so a student
 * never ends up with an empty calendar because the second step failed.
 */
export const importTargetSchema = z.union([
  z.object({ existingSourceId: z.uuid() }),
  z.object({ newSource: calendarSourceSchema }),
]);

export type ImportTarget = z.infer<typeof importTargetSchema>;

export const importRequestSchema = z.object({
  events: z.array(importSelectionSchema).min(1).max(MAX_IMPORT_EVENTS),
  target: importTargetSchema,
});

/**
 * A Google sync confirm, which never asks "which calendar": there is exactly
 * one Google connection per student, so it always lands in the one calendar
 * that connection owns (`GOOGLE_CALENDAR_SOURCE_NAME` in server/import-service.ts),
 * created on first sync.
 */
export const googleImportRequestSchema = z.object({
  events: z.array(importSelectionSchema).min(1).max(MAX_IMPORT_EVENTS),
});

/** Pasting or uploading a file: the text arrives, not the file itself. */
export const icsPreviewSchema = z.object({
  // 4 MB of text is a very large timetable; a browser upload larger than that
  // is a mistake or an attack, and is refused before it is parsed.
  text: z.string().min(1, V.required).max(4_000_000, V.tooLong),
  /** Null when the import is going into a calendar that does not exist yet. */
  sourceId: z.uuid().nullable(),
});

export const icsUrlPreviewSchema = z.object({
  url: z.string().trim().min(1, V.required).max(2000, V.tooLong),
  sourceId: z.uuid().nullable(),
});

export const exportRangeSchema = z
  .object({
    startDate: z.string().regex(ISO_DATE, V.outOfRange),
    endDate: z.string().regex(ISO_DATE, V.outOfRange),
    includeSessions: z.boolean(),
    includeEvents: z.boolean(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: V.endBeforeStart,
    path: ["endDate"],
  })
  .refine((value) => value.includeSessions || value.includeEvents, {
    message: V.required,
    path: ["includeSessions"],
  });

export type ExportRange = z.infer<typeof exportRangeSchema>;
