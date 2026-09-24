import { z } from "zod";

import { V } from "./messages";

/**
 * Study preferences.
 *
 * These rules mirror the CHECK constraints in 0004_planning.sql on purpose. The
 * database is the last line of defence; this layer exists so the student gets a
 * clear message about *which* field is wrong instead of a raw constraint error.
 */

/** "HH:MM" as produced by <input type="time">. */
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, V.outOfRange);

/** ISO weekday, 1 = Monday .. 7 = Sunday. */
const isoWeekday = z.number().int().min(1).max(7);

// No `z.coerce` or `.default()` below, for the same reason as in academic.ts:
// they would make the schema's input and output types differ, which React Hook
// Form cannot express with one form type. Number inputs are registered with
// `valueAsNumber`, and defaults come from `defaultStudyPreferences`.

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export const studyPreferencesSchema = z
  .object({
    minimumSessionMinutes: z.number().int().min(5, V.outOfRange).max(480, V.outOfRange),
    preferredSessionMinutes: z.number().int().min(5, V.outOfRange).max(480, V.outOfRange),
    maximumSessionMinutes: z.number().int().min(5, V.outOfRange).max(480, V.outOfRange),
    maximumDailyMinutes: z.number().int().min(15, V.outOfRange).max(960, V.outOfRange),
    weeklyTargetMinutes: z.number().int().min(0, V.outOfRange).max(6720, V.outOfRange),
    earliestStartTime: timeOfDay,
    latestEndTime: timeOfDay,
    preferredDays: z.array(isoWeekday).min(1, V.pickAtLeastOneDay),
    weekendAllowed: z.boolean(),
    breakMethod: z.enum(["pomodoro", "fifty_ten", "ninety_twenty", "none"]),
    bufferPercentage: z.number().int().min(0, V.outOfRange).max(50, V.outOfRange),
    planningFlexibility: z.enum(["strict", "balanced", "flexible"]),
    energyProfile: z.object({
      morning: z.enum(["high", "medium", "low"]),
      afternoon: z.enum(["high", "medium", "low"]),
      evening: z.enum(["high", "medium", "low"]),
    }),
  })
  .refine(
    (v) =>
      v.minimumSessionMinutes <= v.preferredSessionMinutes &&
      v.preferredSessionMinutes <= v.maximumSessionMinutes,
    { message: V.sessionLengthsIncoherent, path: ["preferredSessionMinutes"] },
  )
  .refine((v) => v.maximumDailyMinutes >= v.minimumSessionMinutes, {
    message: V.dailyLessThanSession,
    path: ["maximumDailyMinutes"],
  })
  .refine((v) => toMinutes(v.latestEndTime) > toMinutes(v.earliestStartTime), {
    message: V.endBeforeStart,
    path: ["latestEndTime"],
  })
  // A window narrower than one session means the planner can never place
  // anything — better to say so here than to return an empty plan later.
  .refine(
    (v) => toMinutes(v.latestEndTime) - toMinutes(v.earliestStartTime) >= v.minimumSessionMinutes,
    { message: V.studyWindowTooShort, path: ["latestEndTime"] },
  );

export type StudyPreferencesInput = z.infer<typeof studyPreferencesSchema>;

export const defaultStudyPreferences: StudyPreferencesInput = {
  minimumSessionMinutes: 25,
  preferredSessionMinutes: 50,
  maximumSessionMinutes: 120,
  maximumDailyMinutes: 300,
  weeklyTargetMinutes: 600,
  earliestStartTime: "08:00",
  latestEndTime: "21:00",
  preferredDays: [1, 2, 3, 4, 5],
  weekendAllowed: false,
  breakMethod: "pomodoro",
  bufferPercentage: 15,
  planningFlexibility: "balanced",
  energyProfile: { morning: "high", afternoon: "medium", evening: "low" },
};
