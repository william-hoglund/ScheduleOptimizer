import type { Locale } from "@/i18n/config";
import type { Segment } from "@/lib/segments";

/**
 * Plain-English labels for the engine's reason codes (`SessionReason.code` in
 * `lib/planner/types.ts`). These are for the model's context only — separate
 * from the `planner.reasons.*` i18n keys the UI translates for the student,
 * because this text is never shown directly; it is only read by the model
 * that writes the explanation.
 */
const REASON_LABEL: Record<string, string> = {
  deadline_pressure: "placed because a deadline is approaching",
  high_energy_match: "placed in one of their higher-energy hours",
  preferred_time: "placed in a time window they prefer",
  spaced_repetition: "placed to space out repeated review",
  spread_before_deadline: "placed to spread work out ahead of a deadline",
  first_available: "placed in the first slot that fit",
  preserved_locked: "kept because the student locked it",
  preserved_manual: "kept because the student moved it themselves",
  preserved_completed: "kept because it is already done",
};

const WARNING_LABEL: Record<string, string> = {
  not_enough_time: "there was not enough free time to fit everything",
  task_at_risk: "a task is at risk of missing its deadline",
  task_unschedulable: "a task could not be scheduled at all",
  deadline_passed: "a deadline has already passed",
  no_availability: "no available hours were found",
  over_daily_limit: "a day would have exceeded the daily limit",
  dependency_cycle: "two tasks depend on each other, which is impossible to schedule",
  horizon_too_short: "the chosen period is too short for the workload",
  days_taken_by_commitments: "whole days were taken up by work or other commitments",
};

export type ExplainPlanSession = {
  title: string;
  courseName: string | null;
  startLocal: string;
  minutes: number;
  reasonCode: string;
};

export type ExplainPlanInput = {
  locale: Locale;
  segment: Segment;
  totalPlannedMinutes: number;
  activeDays: number;
  longestGapDays: number;
  coveragePercent: number;
  sessions: ExplainPlanSession[];
  /** True when more sessions exist than were included below — keeps the prompt bounded. */
  sessionsTruncated: boolean;
  warningCodes: string[];
};

const MAX_SESSIONS_IN_PROMPT = 40;

/** Caps how much of the plan is described to the model — see AI_LIMITS and PLAN.md §8 "AI cost and latency". */
export function boundExplainPlanSessions(
  sessions: ExplainPlanSession[],
): Pick<ExplainPlanInput, "sessions" | "sessionsTruncated"> {
  return {
    sessions: sessions.slice(0, MAX_SESSIONS_IN_PROMPT),
    sessionsTruncated: sessions.length > MAX_SESSIONS_IN_PROMPT,
  };
}

export function buildExplainPlanPrompt(input: ExplainPlanInput): { system: string; prompt: string } {
  const language = input.locale === "sv" ? "Swedish" : "English";
  const audience =
    input.segment === "professional"
      ? "a working professional studying around a job"
      : "a student";

  const system = [
    "You write a short, honest explanation of a study plan that a scheduling algorithm already produced.",
    "You never invent sessions, times or courses beyond what is given to you, and you never suggest the student is behind, failing, or should feel bad about the shape of their week.",
    "No targets, no streaks, no comparisons to some other ideal week — describe what is actually here.",
    `The reader is ${audience}. Reply in ${language}.`,
  ].join(" ");

  const sessionLines = input.sessions
    .map((session) => {
      const reason = REASON_LABEL[session.reasonCode] ?? "placed by the planner";
      const course = session.courseName ? ` (${session.courseName})` : "";
      return `- ${session.startLocal}: "${session.title}"${course}, ${session.minutes} min — ${reason}`;
    })
    .join("\n");

  const warningLines =
    input.warningCodes.length > 0
      ? input.warningCodes.map((code) => `- ${WARNING_LABEL[code] ?? code}`).join("\n")
      : "- none";

  const prompt = [
    `Total planned: ${input.totalPlannedMinutes} minutes across ${input.activeDays} active day(s).`,
    `Longest gap with no study: ${input.longestGapDays} day(s). Coverage of requested work: ${input.coveragePercent}%.`,
    "",
    "Sessions:",
    sessionLines || "- none",
    input.sessionsTruncated ? `(and more sessions, following the same pattern)` : "",
    "",
    "Warnings raised while generating this plan:",
    warningLines,
    "",
    "Write: a one-or-two-sentence summary, 1-5 short highlights each tied to something above, and one encouraging sentence.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, prompt };
}
