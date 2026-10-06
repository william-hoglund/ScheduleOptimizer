import { z } from "zod";

/**
 * What a free-text planning note ("I'm away Thursday to Monday, finish
 * Assessment 1 before that") becomes. Deliberately just two kinds of
 * instruction, both re-validated server-side before they touch the planner:
 * dates must parse and fall in range, task ids must be ones the prompt listed.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const planNotesSchema = z.object({
  /** Whole days with no studying at all — travel, holidays, events. Inclusive. */
  unavailable: z
    .array(z.object({ startDate: isoDate, endDate: isoDate, label: z.string().min(1).max(80) }))
    .max(10),
  /** "Finish X by" — the last day work on that task may happen. Inclusive. */
  finishBy: z
    .array(z.object({ taskId: z.string().min(1).max(64), date: isoDate, label: z.string().min(1).max(120) }))
    .max(10),
  /** Anything in the note that couldn't be turned into one of the above, said plainly. */
  notUnderstood: z.array(z.string().min(1).max(160)).max(5),
});

export type PlanNotesInterpretation = z.infer<typeof planNotesSchema>;
