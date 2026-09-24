import { z } from "zod";

import { V } from "./messages";

/**
 * A calendar the student has imported: one timetable, one job, one anything.
 *
 * The day rule is the part that matters. A calendar can say "a day dominated by
 * me is worth less" — because eight hours at the office does not leave a usable
 * evening — and the threshold is what stops a 45-minute meeting doing the same.
 */

export const CALENDAR_SOURCE_KINDS = ["study", "work", "personal"] as const;
export const DAY_EFFECTS = ["none", "reduce", "block"] as const;

export const calendarSourceSchema = z
  .object({
    name: z.string().trim().min(1, V.required).max(80, V.nameTooLong),
    kind: z.enum(CALENDAR_SOURCE_KINDS),
    dayEffect: z.enum(DAY_EFFECTS),
    /** Minutes of this calendar's events in one day before the rule applies. */
    thresholdMinutes: z.number().int().min(1, V.outOfRange).max(1440, V.outOfRange),
    /** What is left of that day when the effect is "reduce". */
    reducedDailyMinutes: z.number().int().min(0, V.outOfRange).max(1440, V.outOfRange),
  })
  .refine(
    // "Reduce to more than a normal day" is not a reduction; it is a typo the
    // student would never see the effect of.
    (value) => value.dayEffect !== "reduce" || value.reducedDailyMinutes <= 480,
    { message: V.outOfRange, path: ["reducedDailyMinutes"] },
  );

export type CalendarSourceInput = z.infer<typeof calendarSourceSchema>;

/**
 * Sensible starting points per kind, from how these calendars are actually
 * used: a work calendar takes the day it fills, a timetable never does.
 */
export function defaultCalendarSourceInput(
  kind: (typeof CALENDAR_SOURCE_KINDS)[number],
): CalendarSourceInput {
  const isWork = kind === "work";

  return {
    name: "",
    kind,
    dayEffect: isWork ? "block" : "none",
    // Six hours: a working day rather than a long meeting.
    thresholdMinutes: 360,
    reducedDailyMinutes: 30,
  };
}
