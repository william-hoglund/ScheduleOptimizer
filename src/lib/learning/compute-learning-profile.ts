import { bandFor, type TimeOfDayBand } from "@/lib/insights/compute-insights";
import { minutesIntoLocalDay, toEpochMinutes } from "@/lib/planner/time-grid";

/**
 * The Personal Learning Profile's pure computation. Pure like
 * `lib/insights/compute-insights.ts` and `lib/planner/`: no I/O, `nowIso` and
 * `timeZone` are arguments, so it is fully testable and reproducible.
 *
 * Every signal here is purely behavioral — observable planning outcomes, never
 * a psychological inference — and every signal is gated by a minimum sample
 * size, so "not enough data yet" is a real answer this function gives rather
 * than something the caller has to guess from an empty array.
 */

export type LearningInsightType = "best_study_band" | "estimation_bias" | "course_postponement_risk";
export type LearningConfidence = "low" | "medium" | "high";

export type LearningSession = {
  courseId: string | null;
  status: "planned" | "completed" | "missed" | "partial" | "cancelled";
  startAt: string;
  endAt: string;
  /** True when the session was created by a reschedule rather than a plan. */
  wasRescheduled: boolean;
};

export type LearningTask = {
  courseId: string | null;
  estimatedMinutes: number;
  completedMinutes: number;
  status: "not_started" | "in_progress" | "completed" | "cancelled";
};

export type ComputedInsight =
  | {
      type: "best_study_band";
      courseId: null;
      value: { band: TimeOfDayBand };
      confidence: LearningConfidence;
      observationCount: number;
    }
  | {
      type: "estimation_bias";
      courseId: null;
      value: { direction: "underestimates" | "overestimates" | "accurate"; ratioPercent: number };
      confidence: LearningConfidence;
      observationCount: number;
    }
  | {
      type: "course_postponement_risk";
      courseId: string;
      value: { riskLevel: "elevated" };
      confidence: LearningConfidence;
      observationCount: number;
    };

/** Lower bound is inclusive: `count === thresholds.medium` is already "medium". */
function confidenceFor(count: number, thresholds: { medium: number; high: number }): LearningConfidence {
  if (count >= thresholds.high) return "high";
  if (count >= thresholds.medium) return "medium";
  return "low";
}

const BEST_BAND_MIN_SESSIONS = 6;
const BEST_BAND_THRESHOLDS = { medium: 12, high: 24 };

const ESTIMATION_MIN_TASKS = 5;
const ESTIMATION_THRESHOLDS = { medium: 10, high: 20 };
const ESTIMATION_UNDER_RATIO = 1.15;
const ESTIMATION_OVER_RATIO = 0.85;
/** One wildly mis-logged task must not dominate the average. */
const ESTIMATION_RATIO_CLAMP = { min: 0.2, max: 5 };

const POSTPONEMENT_MIN_SESSIONS = 8;
const POSTPONEMENT_MIN_RESCHEDULED = 3;
const POSTPONEMENT_RATE_THRESHOLD = 0.3;
const POSTPONEMENT_THRESHOLDS = { medium: 15, high: 30 };

function computeBestStudyBand(
  sessions: readonly LearningSession[],
  now: number,
  timeZone: string,
): ComputedInsight | null {
  const past = sessions.filter(
    (session) => toEpochMinutes(session.endAt) <= now && session.status !== "cancelled",
  );
  if (past.length < BEST_BAND_MIN_SESSIONS) return null;

  const completionByBand: Record<TimeOfDayBand, { planned: number; completed: number }> = {
    morning: { planned: 0, completed: 0 },
    afternoon: { planned: 0, completed: 0 },
    evening: { planned: 0, completed: 0 },
  };

  for (const session of past) {
    const band = bandFor(minutesIntoLocalDay(toEpochMinutes(session.startAt), timeZone));
    completionByBand[band].planned += 1;
    if (session.status === "completed" || session.status === "partial") {
      completionByBand[band].completed += 1;
    }
  }

  let bestBand: TimeOfDayBand | null = null;
  let bestRate = -1;
  for (const band of ["morning", "afternoon", "evening"] as const) {
    const { planned, completed } = completionByBand[band];
    if (planned <= 0) continue;
    const rate = completed / planned;
    if (rate > bestRate) {
      bestRate = rate;
      bestBand = band;
    }
  }
  if (!bestBand) return null;

  return {
    type: "best_study_band",
    courseId: null,
    value: { band: bestBand },
    confidence: confidenceFor(past.length, BEST_BAND_THRESHOLDS),
    observationCount: past.length,
  };
}

function computeEstimationBias(tasks: readonly LearningTask[]): ComputedInsight | null {
  const qualifying = tasks.filter((task) => task.status === "completed" && task.estimatedMinutes > 0);
  if (qualifying.length < ESTIMATION_MIN_TASKS) return null;

  const ratios = qualifying.map((task) => {
    const raw = task.completedMinutes / task.estimatedMinutes;
    return Math.min(ESTIMATION_RATIO_CLAMP.max, Math.max(ESTIMATION_RATIO_CLAMP.min, raw));
  });
  const averageRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;

  const direction =
    averageRatio > ESTIMATION_UNDER_RATIO
      ? "underestimates"
      : averageRatio < ESTIMATION_OVER_RATIO
        ? "overestimates"
        : "accurate";

  return {
    type: "estimation_bias",
    courseId: null,
    value: { direction, ratioPercent: Math.round(Math.abs(averageRatio - 1) * 100) },
    confidence: confidenceFor(qualifying.length, ESTIMATION_THRESHOLDS),
    observationCount: qualifying.length,
  };
}

function computeCoursePostponementRisk(
  sessions: readonly LearningSession[],
  now: number,
): ComputedInsight[] {
  const past = sessions.filter(
    (session) =>
      session.courseId !== null &&
      toEpochMinutes(session.endAt) <= now &&
      session.status !== "cancelled",
  );

  const byCourse = new Map<string, { total: number; rescheduled: number }>();
  for (const session of past) {
    const courseId = session.courseId as string;
    const entry = byCourse.get(courseId) ?? { total: 0, rescheduled: 0 };
    entry.total += 1;
    if (session.wasRescheduled) entry.rescheduled += 1;
    byCourse.set(courseId, entry);
  }

  const insights: ComputedInsight[] = [];
  for (const [courseId, { total, rescheduled }] of byCourse) {
    if (total < POSTPONEMENT_MIN_SESSIONS) continue;
    if (rescheduled < POSTPONEMENT_MIN_RESCHEDULED) continue;
    if (rescheduled / total <= POSTPONEMENT_RATE_THRESHOLD) continue;

    insights.push({
      type: "course_postponement_risk",
      courseId,
      value: { riskLevel: "elevated" },
      confidence: confidenceFor(total, POSTPONEMENT_THRESHOLDS),
      observationCount: total,
    });
  }
  return insights;
}

export function computeLearningProfile({
  sessions,
  tasks,
  nowIso,
  timeZone,
}: {
  sessions: readonly LearningSession[];
  tasks: readonly LearningTask[];
  nowIso: string;
  timeZone: string;
}): ComputedInsight[] {
  const now = toEpochMinutes(nowIso);

  const insights: ComputedInsight[] = [];
  const bestBand = computeBestStudyBand(sessions, now, timeZone);
  if (bestBand) insights.push(bestBand);

  const estimationBias = computeEstimationBias(tasks);
  if (estimationBias) insights.push(estimationBias);

  insights.push(...computeCoursePostponementRisk(sessions, now));

  return insights;
}
