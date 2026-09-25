import { z } from "zod";

/**
 * What the model may say about a generated plan — never times, never which
 * sessions exist. Those are facts the engine already produced; the model's
 * only job is prose about facts it was handed, which is why nothing here can
 * be mistaken for a schedule.
 */
export const planExplanationSchema = z.object({
  /** One or two sentences: the shape of the week and the main trade-off, if any. */
  summary: z.string().min(1).max(400),
  /** 1–5 short, concrete observations tied to what actually happened in the plan. */
  highlights: z.array(z.string().min(1).max(160)).min(1).max(5),
  /** One encouraging, non-generic sentence. Never a target or a streak — see PLAN.md §"Session 8 decisions". */
  encouragement: z.string().min(1).max(200),
});

export type PlanExplanation = z.infer<typeof planExplanationSchema>;
