import { z } from "zod";

/**
 * The advisor's "propose a change, never make one" vocabulary.
 *
 * This is a closed union on purpose — the model can only ever propose one of
 * the kinds listed here, never an arbitrary write. Each kind is executed by
 * exactly one existing, already-tested code path (see
 * `resolveAdvisorAction` in `src/server/ai-service.ts`): `regenerate_plan`
 * calls the same `generateDraftPlan` action the planner form itself uses,
 * and `set_course_priority` calls the same `updateCourse`-style setter the
 * course form uses. The AI never touches the database directly.
 *
 * `courseIds` and `courseId` are re-validated server-side against the
 * student's *actual* courses before anything runs — the model saw a course
 * list in its prompt, but seeing a name is not the same as it existing, and a
 * hallucinated id must fail closed, not silently do something else.
 *
 * To add a new kind of command: add a variant to this union, add one case to
 * the `switch` in `resolveAdvisorAction`, and (if it needs one) one setter in
 * the relevant `server/*-service.ts` file, following `setTaskProgress` or
 * `setCourseArchived` as the pattern. Nothing else changes.
 */
export const plannerCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("regenerate_plan"),
    /** Course ids from the list given in the prompt. Empty means every active course. */
    courseIds: z.array(z.string().min(1).max(64)).max(10),
    /** Resolved into real dates server-side — the model never invents a date. */
    timeframe: z.enum(["current_plan", "next_7_days"]),
    /** Shown to the student in the confirmation, e.g. "Focus this week on Databases". */
    label: z.string().min(1).max(100),
  }),
  z.object({
    kind: z.literal("set_course_priority"),
    courseId: z.string().min(1).max(64),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    label: z.string().min(1).max(100),
  }),
  z.object({
    kind: z.literal("none"),
  }),
]);

export type PlannerCommand = z.infer<typeof plannerCommandSchema>;

/**
 * The advisor's reply. `inScope` is required, not inferred — see
 * guardrails.ts for why the model being made to commit to this explicitly
 * matters more than the words in `message`.
 */
export const advisorReplySchema = z.object({
  inScope: z.boolean(),
  message: z.string().min(1).max(320),
  action: plannerCommandSchema,
});

export type AdvisorReply = z.infer<typeof advisorReplySchema>;
