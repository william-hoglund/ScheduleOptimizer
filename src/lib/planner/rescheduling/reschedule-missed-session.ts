import { generatePlan } from "../generate-plan";
import type {
  EpochMinutes,
  ExistingSession,
  PlannedSession,
  PlannerInput,
  PlannerResult,
} from "../types";

/**
 * Repairing a plan after a session is missed.
 *
 * The brief is specific: do not rebuild the week because one Tuesday went
 * wrong. So this re-runs the engine with everything else pinned — every other
 * planned session is treated as immovable — and lets it find a home for just
 * the missed work.
 *
 * The result includes an explicit diff, because "show exactly what changed" is
 * the difference between a tool the student trusts and one that quietly
 * rearranges their life.
 */

export type RescheduleOutcome = {
  result: PlannerResult;
  /** Sessions that exist now but did not before. */
  added: PlannedSession[];
  /** Sessions that existed before and are now gone. */
  removed: ExistingSession[];
  /** True when nowhere could be found for the missed work. */
  couldNotPlace: boolean;
};

export function rescheduleMissedSessions(
  input: PlannerInput,
  missedSessionIds: readonly string[],
): RescheduleOutcome {
  const missed = new Set(missedSessionIds);

  const survivors = input.existingSessions.filter((session) => !missed.has(session.id));
  const missedSessions = input.existingSessions.filter((session) => missed.has(session.id));

  /**
   * Everything that is staying gets pinned.
   *
   * Marking survivors as locked is what produces a minimal change: the engine
   * preserves them verbatim and can only place the missed work in whatever gaps
   * are genuinely left over.
   */
  const pinned: ExistingSession[] = survivors.map((session) =>
    session.status === "planned" && !session.isLocked ? { ...session, isLocked: true } : session,
  );

  const result = generatePlan({ ...input, existingSessions: pinned });

  const previousStarts = new Set(
    input.existingSessions
      .filter((session) => !missed.has(session.id))
      .map((session) => `${session.taskId ?? ""}:${session.start}`),
  );

  const added = result.sessions.filter(
    (session) =>
      !session.preserved && !previousStarts.has(`${session.taskId ?? ""}:${session.start}`),
  );

  // The missed work is placed again only if the engine found room for that
  // task; otherwise the student needs to hear that it did not fit.
  const rescheduledTaskIds = new Set(added.map((session) => session.taskId));
  const couldNotPlace = missedSessions.some(
    (session) => session.taskId !== null && !rescheduledTaskIds.has(session.taskId),
  );

  return { result, added, removed: missedSessions, couldNotPlace };
}

/**
 * How much a regenerated plan disturbs the previous one.
 *
 * Used to compare alternatives: given two plans that both work, the one that
 * moves fewer existing sessions is the better answer.
 */
export function countDisturbance(
  before: readonly ExistingSession[],
  after: readonly PlannedSession[],
): number {
  const beforeKeys = new Set(
    before
      .filter((session) => session.status === "planned")
      .map((session) => `${session.taskId ?? ""}:${session.start}`),
  );

  let moved = 0;
  for (const session of after) {
    if (session.preserved) continue;
    if (!beforeKeys.has(`${session.taskId ?? ""}:${session.start}`)) moved += 1;
  }

  return moved;
}

/** Convenience for the UI: which local dates a diff touches. */
export function affectedRange(sessions: readonly PlannedSession[]): {
  start: EpochMinutes;
  end: EpochMinutes;
} | null {
  if (sessions.length === 0) return null;

  return {
    start: Math.min(...sessions.map((session) => session.start)),
    end: Math.max(...sessions.map((session) => session.end)),
  };
}
