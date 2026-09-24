import { z } from "zod";

import { V } from "./messages";

/**
 * Manually created calendar events: lectures, seminars, personal commitments.
 *
 * Imported events arrive through `features/import-export/` (Session 9) and
 * Google through Session 11; neither is editable here.
 *
 * Start and end are wall-clock; the server converts using the student's zone.
 */

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const EVENT_TYPES = [
  "lecture",
  "seminar",
  "lab",
  "exam",
  "deadline",
  "personal",
  "other",
] as const;

export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(1, V.required).max(200, V.nameTooLong),
    courseId: z.uuid().or(z.literal("")).nullable(),
    eventType: z.enum(EVENT_TYPES),
    description: z.string().trim().max(2000, V.tooLong).nullable(),
    location: z.string().trim().max(200, V.tooLong).nullable(),
    startLocal: z.string().regex(LOCAL_DATE_TIME, V.outOfRange),
    endLocal: z.string().regex(LOCAL_DATE_TIME, V.outOfRange),
    // Fixed events are obstacles the planner must schedule around. Unticking
    // this marks something as movable, so study time may be placed over it.
    isFixed: z.boolean(),
  })
  // Compared as strings, which is safe because the format is zero-padded and
  // both values are in the same zone. The database enforces this too.
  .refine((v) => v.endLocal > v.startLocal, {
    message: V.endBeforeStart,
    path: ["endLocal"],
  });

export type CalendarEventInput = z.infer<typeof calendarEventSchema>;

export function defaultCalendarEventInput(
  startLocal: string,
  endLocal: string,
): CalendarEventInput {
  return {
    title: "",
    courseId: null,
    eventType: "lecture",
    description: null,
    location: null,
    startLocal,
    endLocal,
    isFixed: true,
  };
}
