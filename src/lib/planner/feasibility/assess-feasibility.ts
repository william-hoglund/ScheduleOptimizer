import { remainingMinutesFor } from "../tasks/calculate-task-urgency";
import type {
  EpochMinutes,
  FeasibilityReport,
  PlannerPreferences,
  PlannerRemedy,
  PlannerTask,
} from "../types";

/**
 * Whether the work actually fits.
 *
 * The brief is emphatic that the system must not pretend. If a student needs
 * thirty hours and has twelve, saying so plainly — with concrete options — is
 * more useful than a tidy plan that silently drops two-thirds of the work.
 *
 * Runs *before* placement so the warning can be shown alongside the plan rather
 * than inferred from what happens to be missing at the end.
 */

export function assessFeasibility({
  tasks,
  availableMinutes,
  preferences,
  now,
  horizonEnd,
}: {
  tasks: readonly PlannerTask[];
  availableMinutes: number;
  preferences: PlannerPreferences;
  now: EpochMinutes;
  horizonEnd: EpochMinutes;
}): FeasibilityReport {
  const requiredMinutes = tasks.reduce((sum, task) => sum + remainingMinutesFor(task), 0);

  // Buffer is time deliberately not planned, so one bad day does not cascade.
  const bufferShare = Math.min(Math.max(preferences.bufferPercentage, 0), 50) / 100;
  const usableMinutes = Math.floor(availableMinutes * (1 - bufferShare));

  const shortfallMinutes = Math.max(0, requiredMinutes - usableMinutes);
  const feasible = shortfallMinutes === 0;

  // A task is at risk when its own remaining work cannot fit before its own
  // deadline, regardless of everything else competing for the same hours.
  const atRiskTaskIds: string[] = [];
  for (const task of tasks) {
    const remaining = remainingMinutesFor(task);
    if (remaining <= 0) continue;

    const deadline = task.deadline ?? horizonEnd;
    // Time before the task's own start date can't be spent on it.
    const minutesUntilDeadline = Math.max(0, deadline - Math.max(now, task.notBefore ?? now));
    const daysUntil = minutesUntilDeadline / 1440;
    const theoreticalCapacity = daysUntil * preferences.maximumDailyMinutes;

    if (remaining > theoreticalCapacity) atRiskTaskIds.push(task.id);
  }

  return {
    requiredMinutes,
    availableMinutes,
    usableMinutes,
    feasible,
    shortfallMinutes,
    atRiskTaskIds,
    remedies: feasible ? [] : suggestRemedies({ shortfallMinutes, preferences, tasks }),
  };
}

/**
 * Concrete ways out, ordered cheapest first.
 *
 * Deliberately actionable rather than "try to do more" — the brief asks for
 * options a student can actually take, including asking for an extension.
 */
export function suggestRemedies({
  shortfallMinutes,
  preferences,
  tasks,
}: {
  shortfallMinutes: number;
  preferences: PlannerPreferences;
  tasks: readonly PlannerTask[];
}): PlannerRemedy[] {
  const remedies: PlannerRemedy[] = [];
  const shortfallHours = Math.ceil(shortfallMinutes / 60);

  if (!preferences.weekendAllowed) {
    remedies.push({ code: "allow_weekends", details: { hours: shortfallHours } });
  }

  const dailyHeadroom = 480 - preferences.maximumDailyMinutes;
  if (dailyHeadroom > 0) {
    remedies.push({
      code: "extend_daily_limit",
      details: { current: preferences.maximumDailyMinutes },
    });
  }

  remedies.push({ code: "increase_available_time", details: { hours: shortfallHours } });

  // Ungraded work is the least costly thing to trim, so name it explicitly.
  const ungraded = tasks.filter((task) => task.taskType === "reading" || task.taskType === "other");
  if (ungraded.length > 0) {
    remedies.push({ code: "reduce_scope", details: { count: ungraded.length } });
  }

  const graded = tasks.filter((task) => task.taskType === "exam" || task.taskType === "assignment");
  if (graded.length > 0 && ungraded.length > 0) {
    remedies.push({ code: "prioritise_graded", details: { count: graded.length } });
  }

  // Only worth suggesting when the gap is large enough that no amount of
  // rearranging will close it.
  if (shortfallMinutes > 600) {
    remedies.push({ code: "ask_for_extension" });
  }

  return remedies;
}
