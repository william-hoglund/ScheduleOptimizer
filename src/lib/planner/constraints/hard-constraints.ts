import { overlaps } from "../interval";
import { dailyCapFor } from "../availability/apply-day-effects";
import { epochMinutesToLocalDate } from "../time-grid";
import type { EpochMinutes, Interval, PlannedSession, PlannerPreferences } from "../types";

/**
 * Rules that can never be broken.
 *
 * Kept separate from scoring on purpose: soft preferences trade off against
 * each other, but these are absolute. Every candidate placement passes through
 * `violatesHardConstraint` before it is scored, and the finished plan is
 * checked again by `findConflicts` — a belt-and-braces pass that would catch a
 * bug in the placement loop rather than shipping an impossible schedule.
 */

export type HardConstraintViolation =
  | "outside_availability"
  | "overlaps_session"
  | "after_deadline"
  | "exceeds_daily_limit"
  | "non_positive_duration"
  | "in_the_past";

export type PlacementContext = {
  now: EpochMinutes;
  timeZone: string;
  preferences: PlannerPreferences;
  /** Free windows, already merged and with fixed events removed. */
  windows: readonly Interval[];
  /** Sessions placed so far, including preserved ones. */
  placed: readonly Interval[];
  /** Minutes already committed per local date. */
  minutesByDate: ReadonlyMap<string, number>;
  /**
   * Per-date caps from an imported calendar's day rule — a work day leaves less
   * than the usual daily limit, or nothing at all. Absent for ordinary days.
   */
  dailyCapByDate: ReadonlyMap<string, number>;
};

function withinSomeWindow(candidate: Interval, windows: readonly Interval[]): boolean {
  return windows.some((window) => window.start <= candidate.start && candidate.end <= window.end);
}

export function violatesHardConstraint(
  candidate: Interval,
  {
    context,
    deadline,
  }: {
    context: PlacementContext;
    deadline: EpochMinutes | null;
  },
): HardConstraintViolation | null {
  if (candidate.end <= candidate.start) return "non_positive_duration";
  if (candidate.start < context.now) return "in_the_past";

  // Availability already has fixed events and unavailable rules removed, so
  // "inside a window" covers both at once.
  if (!withinSomeWindow(candidate, context.windows)) return "outside_availability";

  if (context.placed.some((session) => overlaps(session, candidate))) return "overlaps_session";

  if (deadline !== null && candidate.end > deadline) return "after_deadline";

  const date = epochMinutesToLocalDate(candidate.start, context.timeZone);
  const already = context.minutesByDate.get(date) ?? 0;
  const length = candidate.end - candidate.start;
  // A day the student spends at work carries its own, lower limit.
  const cap = dailyCapFor(date, context.dailyCapByDate, context.preferences.maximumDailyMinutes);
  if (already + length > cap) return "exceeds_daily_limit";

  return null;
}

export type PlanConflict = {
  code: "overlap" | "outside_availability" | "past_deadline" | "daily_limit";
  sessionIndex: number;
  otherIndex?: number;
  details?: Record<string, string | number>;
};

/**
 * Validates a finished plan.
 *
 * Runs after generation, over the whole result. If this ever returns anything,
 * the placement loop has a bug — the plan is still returned, but with critical
 * warnings attached rather than silently handing the student a broken week.
 */
export function findConflicts(
  sessions: readonly PlannedSession[],
  {
    windows,
    timeZone,
    preferences,
    deadlinesByTask,
  }: {
    windows: readonly Interval[];
    timeZone: string;
    preferences: PlannerPreferences;
    deadlinesByTask: ReadonlyMap<string, EpochMinutes | null>;
  },
): PlanConflict[] {
  const conflicts: PlanConflict[] = [];
  const ordered = sessions
    .map((session, index) => ({ session, index }))
    .sort((a, b) => a.session.start - b.session.start);

  // Sorted, so only neighbours can overlap — no need to compare every pair.
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (!previous || !current) continue;

    if (overlaps(previous.session, current.session)) {
      conflicts.push({
        code: "overlap",
        sessionIndex: current.index,
        otherIndex: previous.index,
      });
    }
  }

  const minutesByDate = new Map<string, number>();

  for (const { session, index } of ordered) {
    // Preserved sessions are the student's own decisions and may legitimately
    // sit outside the current windows — the rule is that the engine must not
    // *place* work there, not that history must be rewritten.
    if (!session.preserved && !withinSomeWindow(session, windows)) {
      conflicts.push({ code: "outside_availability", sessionIndex: index });
    }

    const deadline = session.taskId ? deadlinesByTask.get(session.taskId) : null;
    if (!session.preserved && deadline != null && session.end > deadline) {
      conflicts.push({ code: "past_deadline", sessionIndex: index });
    }

    const date = epochMinutesToLocalDate(session.start, timeZone);
    const total = (minutesByDate.get(date) ?? 0) + session.minutes;
    minutesByDate.set(date, total);
  }

  for (const [date, total] of minutesByDate) {
    if (total > preferences.maximumDailyMinutes) {
      conflicts.push({
        code: "daily_limit",
        sessionIndex: -1,
        details: { date, total, limit: preferences.maximumDailyMinutes },
      });
    }
  }

  return conflicts;
}
