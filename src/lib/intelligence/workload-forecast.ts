import { assessFeasibility } from "@/lib/planner/feasibility/assess-feasibility";
import type { EpochMinutes, PlannerPreferences, PlannerRemedy, PlannerTask } from "@/lib/planner/types";

/**
 * Multi-horizon workload pressure, built entirely from the planner's own
 * feasibility math (`assessFeasibility`/`suggestRemedies`). No new scheduling
 * logic here — a forecast is that function run over three windows instead of
 * one, which is why this stays pure and reuses the engine's own types
 * (`PlannerTask`, `PlannerPreferences`, `PlannerRemedy`) rather than inventing
 * parallel ones.
 *
 * Deliberately stateless: nothing here reads the clock or a database, so a
 * future "what if" feature can call `buildHorizonForecast` twice — once with
 * the real tasks/preferences, once with a hypothetical variant — and diff the
 * two results, with no refactor.
 */

export type ForecastHorizonDays = 7 | 14 | 30;

export type ForecastPressure = "normal" | "elevated" | "high" | "critical";

export type ForecastReason = {
  code: "overlapping_deadlines" | "single_heavy_task" | "insufficient_time";
  details?: Record<string, string | number>;
};

export type HorizonForecast = {
  horizonDays: ForecastHorizonDays;
  requiredMinutes: number;
  availableMinutes: number;
  shortfallMinutes: number;
  pressure: ForecastPressure;
  /** null exactly when pressure is "normal" — there is nothing to explain. */
  mainReason: ForecastReason | null;
  remedies: PlannerRemedy[];
};

/**
 * How much of the required work cannot fit, relative to the work itself.
 *
 * Relative rather than absolute: two hours short is a rounding error against
 * a 40-hour exam period and a crisis against a light week, so the same
 * shortfall in minutes must not always mean the same pressure.
 */
export function classifyPressure(requiredMinutes: number, shortfallMinutes: number): ForecastPressure {
  if (shortfallMinutes <= 0) return "normal";
  const ratio = requiredMinutes > 0 ? shortfallMinutes / requiredMinutes : 1;
  if (ratio <= 0.15) return "elevated";
  if (ratio <= 0.4) return "high";
  return "critical";
}

/**
 * Names the single biggest driver of the pressure, so the student reads a
 * reason rather than just a number. Only called once pressure is not
 * "normal" — a feasible week has nothing to explain.
 */
export function deriveMainReason({
  atRiskTasks,
  courseNameById,
  shortfallMinutes,
}: {
  atRiskTasks: ReadonlyArray<{ id: string; title: string; courseId: string | null }>;
  courseNameById: ReadonlyMap<string, string>;
  shortfallMinutes: number;
}): ForecastReason | null {
  if (shortfallMinutes <= 0) return null;

  const distinctCourses = new Set(
    atRiskTasks.map((task) => task.courseId).filter((id): id is string => id !== null),
  );

  if (atRiskTasks.length >= 2 && distinctCourses.size >= 2) {
    const [courseAId = "", courseBId = ""] = [...distinctCourses];
    return {
      code: "overlapping_deadlines",
      details: {
        courseA: courseNameById.get(courseAId) ?? "",
        courseB: courseNameById.get(courseBId) ?? "",
      },
    };
  }

  const onlyAtRiskTask = atRiskTasks.length === 1 ? atRiskTasks[0] : undefined;
  if (onlyAtRiskTask) {
    return {
      code: "single_heavy_task",
      details: {
        title: onlyAtRiskTask.title,
        courseName: onlyAtRiskTask.courseId ? (courseNameById.get(onlyAtRiskTask.courseId) ?? "") : "",
      },
    };
  }

  return { code: "insufficient_time", details: { shortfallHours: Math.ceil(shortfallMinutes / 60) } };
}

export function buildHorizonForecast({
  horizonDays,
  tasks,
  availableMinutes,
  preferences,
  now,
  horizonEnd,
  courseNameById,
}: {
  horizonDays: ForecastHorizonDays;
  /** Already filtered to this horizon by the caller (deadline within it). */
  tasks: readonly PlannerTask[];
  availableMinutes: number;
  preferences: PlannerPreferences;
  now: EpochMinutes;
  horizonEnd: EpochMinutes;
  courseNameById: ReadonlyMap<string, string>;
}): HorizonForecast {
  const feasibility = assessFeasibility({ tasks, availableMinutes, preferences, now, horizonEnd });

  const pressure = classifyPressure(feasibility.requiredMinutes, feasibility.shortfallMinutes);
  const atRiskTasks = tasks
    .filter((task) => feasibility.atRiskTaskIds.includes(task.id))
    .map((task) => ({ id: task.id, title: task.title, courseId: task.courseId }));

  const mainReason =
    pressure === "normal"
      ? null
      : deriveMainReason({
          atRiskTasks,
          courseNameById,
          shortfallMinutes: feasibility.shortfallMinutes,
        });

  return {
    horizonDays,
    requiredMinutes: feasibility.requiredMinutes,
    availableMinutes: feasibility.availableMinutes,
    shortfallMinutes: feasibility.shortfallMinutes,
    pressure,
    mainReason,
    // assessFeasibility already computes remedies (empty when feasible) —
    // no reason to call suggestRemedies a second time here.
    remedies: feasibility.remedies,
  };
}
