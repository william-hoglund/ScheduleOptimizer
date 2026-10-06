import type { PlannerCommand } from "./schemas/advisor";

/**
 * The re-check between "the model proposed this" and "this actually runs".
 *
 * Pure — no Supabase, no network — precisely so it can be unit-tested without
 * a database, the same way everything under `lib/` is. The model only ever
 * saw a snapshot of the student's courses in its prompt; by the time this
 * runs that snapshot could be stale, or the model could simply have made
 * something up. Either way, an id that is not in `validCourseIds` must fail
 * closed rather than let a write happen against a guess.
 */

export type CommandContext = {
  validCourseIds: ReadonlySet<string>;
  /** Open tasks the advisor was actually shown — see the same hallucination
   *  concern `validCourseIds` exists for, just for a task id instead. */
  validTaskIds: ReadonlySet<string>;
  currentPlanHorizon: { startDate: string; endDate: string } | null;
  /** Local calendar date, "YYYY-MM-DD". */
  today: string;
};

export type ResolvedCommand =
  | { kind: "regenerate_plan"; courseIds: string[]; startDate: string; endDate: string; label: string }
  | { kind: "set_course_priority"; courseId: string; priority: 1 | 2 | 3 | 4 | 5; label: string }
  | { kind: "apply_forecast_remedy"; remedyCode: "allow_weekends" | "extend_daily_limit"; label: string }
  | { kind: "set_task_session_minutes"; taskId: string; minutes: number; label: string }
  | { kind: "none" };

function nextSevenDays(today: string): { startDate: string; endDate: string } {
  const endDate = new Date(Date.parse(`${today}T00:00:00Z`) + 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return { startDate: today, endDate };
}

/**
 * Returns `null` when the command cannot be honoured as proposed — a
 * hallucinated course id, most likely — which callers treat as "no action",
 * never as "do something else instead".
 */
export function resolvePlannerCommand(
  command: PlannerCommand,
  context: CommandContext,
): ResolvedCommand | null {
  switch (command.kind) {
    case "none":
      return command;

    case "apply_forecast_remedy":
      // Nothing to validate against the account: the remedy code is already a
      // closed, schema-validated enum of two safe, idempotent, globally-
      // applicable preference toggles — unlike a course id, there is no
      // "hallucinated" value it could resolve to.
      return command;

    case "set_course_priority": {
      if (!context.validCourseIds.has(command.courseId)) return null;
      return {
        kind: "set_course_priority",
        courseId: command.courseId,
        priority: command.priority,
        label: command.label,
      };
    }

    case "set_task_session_minutes": {
      if (!context.validTaskIds.has(command.taskId)) return null;
      return {
        kind: "set_task_session_minutes",
        taskId: command.taskId,
        minutes: command.minutes,
        label: command.label,
      };
    }

    case "regenerate_plan": {
      const courseIds = command.courseIds.filter((id) => context.validCourseIds.has(id));
      // Asked to focus on specific courses, and none of them resolved — that is
      // a hallucination, not "focus on everything", so refuse rather than
      // silently regenerate a plan the student did not ask for.
      if (command.courseIds.length > 0 && courseIds.length === 0) return null;

      const horizon =
        command.timeframe === "current_plan" && context.currentPlanHorizon
          ? context.currentPlanHorizon
          : nextSevenDays(context.today);

      return {
        kind: "regenerate_plan",
        courseIds,
        startDate: horizon.startDate,
        endDate: horizon.endDate,
        label: command.label,
      };
    }
  }
}
