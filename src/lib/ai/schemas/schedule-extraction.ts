import { z } from "zod";

import { EVENT_TYPES } from "@/lib/validation/calendar-event";

/**
 * Structured output for "read this photo of a timetable and tell me what's
 * on it" — the vision counterpart to `course-extraction.ts`'s "read this
 * syllabus". Same house rule: never invent an entry, never invent a time.
 *
 * A photographed or screenshotted timetable is almost always a *weekly
 * pattern* ("Mondays 10:00–12:00, Databases, Room B12"), not a list of
 * specific dates — so `dayOfWeek` is the normal case and `date` is the
 * exception (a one-off entry, or a calendar page that happens to show actual
 * dates rather than a generic week grid). Exactly one of the two is ever
 * filled in; `lib/calendar/schedule-image.ts` is what turns whichever one a
 * row has into real calendar instants, expanding `dayOfWeek` rows across the
 * date range the student picks on the review screen.
 */

const confidenceSchema = z.enum(["high", "medium", "low"]);

const scheduleEntrySchema = z.object({
  title: z.string().min(1).max(200),
  /** 0 = Sunday .. 6 = Saturday, matching JS `Date#getDay()`. Null when `date` is set instead. */
  dayOfWeek: z.number().int().min(0).max(6).nullable(),
  /** ISO date (YYYY-MM-DD) for a one-off entry. Null when `dayOfWeek` is set instead. */
  date: z.string().nullable(),
  /** "HH:MM", 24-hour. Null only if the image genuinely does not show a time. */
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  location: z.string().max(200).nullable(),
  /** A course code if the image shows one near this entry, verbatim as written. */
  courseCode: z.string().max(20).nullable(),
  eventType: z.enum(EVENT_TYPES),
  confidence: confidenceSchema,
});

export const scheduleExtractionSchema = z.object({
  /** One or two sentences, shown on the review screen — not stored anywhere. */
  imageSummary: z.string().max(400),
  /** True when the image plainly isn't a timetable (a receipt, a meme, a blank photo). */
  looksLikeASchedule: z.boolean(),
  entries: z.array(scheduleEntrySchema).max(60),
});

export type ScheduleExtraction = z.infer<typeof scheduleExtractionSchema>;
export type ExtractedScheduleEntry = z.infer<typeof scheduleEntrySchema>;
