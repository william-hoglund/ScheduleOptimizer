import type { Locale } from "@/i18n/config";
import type { ForecastPressure, ForecastReason, HorizonForecast } from "@/lib/intelligence/workload-forecast";
import type { Segment } from "@/lib/segments";
import type { Json, LearningInsightType } from "@/lib/supabase/types";
import { advisorSystemPrompt } from "../guardrails";

export type AdvisorCourse = {
  id: string;
  name: string;
  priority: number;
};

export type AdvisorTask = {
  id: string;
  title: string;
  courseName: string | null;
  deadlineLocal: string | null;
  priority: number;
};

export type AdvisorBehaviorHighlight = {
  insightType: LearningInsightType;
  computedValue: Json;
  /** Resolved server-side; null for the two global insight types. */
  courseName: string | null;
  observationCount: number;
};

export type AdvisorInput = {
  locale: Locale;
  segment: Segment;
  todayLocal: string;
  message: string;
  courses: AdvisorCourse[];
  upcomingTasks: AdvisorTask[];
  hasCurrentPlan: boolean;
  /** All 3 horizons, from `getWorkloadForecast` — small enough to send whole. */
  workload: HorizonForecast[];
  /** Top few Learning Profile insights, most-confident first. */
  behaviorHighlights: AdvisorBehaviorHighlight[];
};

const MAX_COURSES_IN_PROMPT = 20;
const MAX_TASKS_IN_PROMPT = 15;

/** See AI_LIMITS and PLAN.md §8 "hard cap on how much data goes into a prompt". */
export function boundAdvisorContext(
  courses: AdvisorCourse[],
  upcomingTasks: AdvisorTask[],
): Pick<AdvisorInput, "courses" | "upcomingTasks"> {
  return {
    courses: courses.slice(0, MAX_COURSES_IN_PROMPT),
    upcomingTasks: upcomingTasks.slice(0, MAX_TASKS_IN_PROMPT),
  };
}

/**
 * Plain-English labels for the forecast's and learning profile's codes, for
 * the model's context only — separate from the `intelligence.forecast.*` /
 * `learning.*` i18n keys the UI translates for the student, same reasoning as
 * `explain-plan.ts`'s `REASON_LABEL`/`WARNING_LABEL`.
 */
const PRESSURE_LABEL: Record<ForecastPressure, string> = {
  normal: "on track",
  elevated: "slightly busy",
  high: "busy",
  critical: "very busy",
};

function describeForecastReason(reason: ForecastReason): string {
  switch (reason.code) {
    case "overlapping_deadlines":
      return `${reason.details?.courseA ?? "one course"} and ${reason.details?.courseB ?? "another"} both have work due around the same time`;
    case "single_heavy_task":
      return `"${reason.details?.title ?? "a task"}"${reason.details?.courseName ? ` (${reason.details.courseName})` : ""} needs more time than usually fits before its deadline`;
    case "insufficient_time":
      return "there isn't quite enough open time in this period for everything due";
  }
}

function describeBehaviorHighlight(highlight: AdvisorBehaviorHighlight): string {
  if (highlight.insightType === "best_study_band") {
    const { band } = highlight.computedValue as { band: string };
    return `tends to complete more planned sessions in the ${band}`;
  }

  if (highlight.insightType === "estimation_bias") {
    const { direction, ratioPercent } = highlight.computedValue as {
      direction: "underestimates" | "overestimates" | "accurate";
      ratioPercent: number;
    };
    if (direction === "accurate") return "estimates task time accurately";
    return `tends to ${direction === "underestimates" ? "need" : "finish"} about ${ratioPercent}% ${direction === "underestimates" ? "more" : "faster"} than estimated`;
  }

  return `sessions for ${highlight.courseName ?? "one course"} get rescheduled more often than usual`;
}

export function buildAdvisorPrompt(input: AdvisorInput): { system: string; prompt: string } {
  const system = advisorSystemPrompt(input.locale);

  const courseLines =
    input.courses.length > 0
      ? input.courses.map((c) => `- ${c.id}: "${c.name}" (priority ${c.priority}/5)`).join("\n")
      : "- none";

  const taskLines =
    input.upcomingTasks.length > 0
      ? input.upcomingTasks
          .map(
            (t) =>
              `- ${t.id}: "${t.title}"${t.courseName ? ` (${t.courseName})` : ""}, priority ${t.priority}/5` +
              (t.deadlineLocal ? `, due ${t.deadlineLocal}` : ", no deadline"),
          )
          .join("\n")
      : "- none";

  const workloadLines =
    input.workload.length > 0
      ? input.workload
          .map((horizon) => {
            const reason = horizon.mainReason ? ` — ${describeForecastReason(horizon.mainReason)}` : "";
            return `- Next ${horizon.horizonDays} days: ${PRESSURE_LABEL[horizon.pressure]}${reason}`;
          })
          .join("\n")
      : "";

  const behaviorLines =
    input.behaviorHighlights.length > 0
      ? input.behaviorHighlights
          .map((h) => `- ${describeBehaviorHighlight(h)} (based on ${h.observationCount} observations)`)
          .join("\n")
      : "";

  const prompt = [
    `Today: ${input.todayLocal}.`,
    input.hasCurrentPlan ? "There is a current plan for this period." : "No plan exists for this period yet.",
    "",
    "Courses (id: name):",
    courseLines,
    "",
    "Upcoming tasks (id: title):",
    taskLines,
    workloadLines ? "\nUpcoming workload:\n" + workloadLines : "",
    behaviorLines ? "\nWhat we've noticed about how the student studies:\n" + behaviorLines : "",
    "",
    `The student wrote: "${input.message}"`,
    "",
    "If this asks for a concrete, achievable change to their plan or a course's priority, propose one action using only the ids listed above. If it asks for a specific task to get longer or shorter study sessions than usual (e.g. \"give me long sessions for Assignment 1\", \"shorter blocks for the reading\"), propose action.kind \"set_task_session_minutes\" with that task's id and a sensible minutes value between 15 and 480 (a plain student request for \"long\" without a number might mean roughly 90-120; \"short\" might mean 25-30 — use judgement, do not just guess an arbitrary large number). If it's about workload pressure and the upcoming workload above shows more than \"on track\", you may instead propose action.kind \"apply_forecast_remedy\" with remedyCode \"allow_weekends\" or \"extend_daily_limit\" when that would plausibly help. Otherwise set action.kind to \"none\".",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { system, prompt };
}
