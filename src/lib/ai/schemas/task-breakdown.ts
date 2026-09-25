import { z } from "zod";

/**
 * Proposed subtasks for one task. Nothing here is written to the database by
 * the model — it is shown to the student to tick and approve, exactly like an
 * `.ics` import row, and only the ticked ones become real `tasks` rows via the
 * ordinary `createTask` path.
 */
export const taskBreakdownSchema = z.object({
  subtasks: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        estimatedMinutes: z.number().int().min(5).max(480),
      }),
    )
    .min(2)
    .max(8),
});

export type TaskBreakdown = z.infer<typeof taskBreakdownSchema>;
