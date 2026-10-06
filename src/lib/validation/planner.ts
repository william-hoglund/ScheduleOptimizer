import { z } from "zod";

import { V } from "./messages";

/**
 * What the student chooses before generating a plan.
 *
 * Most planning settings already live in `study_preferences`. This adds only
 * what is specific to one run: the period, which courses to focus on, and
 * optional one-off overrides that do **not** change their saved settings —
 * "just for this week, I can do more hours" should not silently become
 * permanent.
 */

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, V.outOfRange);

export const plannerRunSchema = z
  .object({
    startDate: localDate,
    endDate: localDate,
    /** Empty means every active course. */
    courseIds: z.array(z.uuid()).default([]),
    /** Free text for this plan only, e.g. "away Thu–Mon, finish Assessment 1 first". */
    notes: z.string().trim().max(600, V.tooLong).optional(),
    /** Changes the tie-breaking, which is how "show me another option" works. */
    seed: z.string().max(64).optional(),
    overrides: z
      .object({
        maximumDailyMinutes: z.coerce.number().int().min(15).max(960).optional(),
        earliestStartTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .optional(),
        latestEndTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .optional(),
        weekendAllowed: z.boolean().optional(),
        bufferPercentage: z.coerce.number().int().min(0).max(50).optional(),
        preferredDays: z.array(z.coerce.number().int().min(1).max(7)).optional(),
      })
      .default({}),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: V.endBeforeStart,
    path: ["endDate"],
  })
  // A horizon longer than a term is almost always a typo, and the search space
  // grows with it.
  .refine(
    (value) =>
      (Date.parse(`${value.endDate}T00:00:00Z`) - Date.parse(`${value.startDate}T00:00:00Z`)) /
        86_400_000 <=
      120,
    { message: V.outOfRange, path: ["endDate"] },
  );

export type PlannerRunInput = z.infer<typeof plannerRunSchema>;
