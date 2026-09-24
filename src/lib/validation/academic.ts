import { z } from "zod";

import { V } from "./messages";

/**
 * Institutions, degree programs and courses.
 *
 * Deliberately free of `z.coerce`, `.default()` and `.transform()`: each of
 * those makes the schema's input type differ from its output type, which React
 * Hook Form cannot reconcile with a single form type. Numbers are converted at
 * the input (`valueAsNumber`), and empty strings become null in the service
 * layer, so input and output stay identical here.
 */

/** Optional free text. "" is accepted and normalised to null before storage. */
const optionalText = (max: number) => z.string().trim().max(max, V.tooLong).nullable();

const optionalDate = z.string().date().or(z.literal("")).nullable();

export const institutionSchema = z.object({
  name: z.string().trim().min(1, V.required).max(120, V.nameTooLong),
  type: z.enum(["university", "college", "school", "other"]),
});

export const programSchema = z.object({
  name: z.string().trim().min(1, V.required).max(120, V.nameTooLong),
  institutionId: z.uuid().nullable(),
  startDate: optionalDate,
  endDate: optionalDate,
  color: optionalText(32),
});

export const courseSchema = z
  .object({
    name: z.string().trim().min(1, V.required).max(120, V.nameTooLong),
    code: optionalText(20),
    programId: z.uuid().or(z.literal("")).nullable(),
    description: optionalText(1000),
    color: optionalText(32),
    difficulty: z.number().int().min(1, V.outOfRange).max(5, V.outOfRange),
    priority: z.number().int().min(1, V.outOfRange).max(5, V.outOfRange),
    targetGrade: optionalText(10),
    estimatedWeeklyHours: z
      .number()
      .min(0, V.outOfRange)
      .max(168, V.outOfRange)
      .nullable()
      // An empty number input yields NaN, which would otherwise pass min/max.
      .refine((v) => v === null || !Number.isNaN(v), V.invalidNumber),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  // A course ending before it starts is nearly always a typo, and it would
  // quietly break the planner's horizon later.
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    message: V.endBeforeStart,
    path: ["endDate"],
  });

export type InstitutionInput = z.infer<typeof institutionSchema>;
export type ProgramInput = z.infer<typeof programSchema>;
export type CourseInput = z.infer<typeof courseSchema>;
