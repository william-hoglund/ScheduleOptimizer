import type { EpochMinutes, PlannerTask, TaskType } from "../types";
import type { SessionChunk } from "./split-task-into-sessions";

/**
 * Guided sessions: an assessment's work is planned as a short "get started"
 * session well before the deadline, then working sessions, then a final
 * "finish & review" one — so each session says what it is for, and the bulk of
 * the work doesn't land months early.
 *
 * Pure and engine-side; the UI turns the phase into guidance text.
 */

export type SessionPhase = "intro" | "work" | "finish";

/** Coursework and exams get phases; errands and to-dos don't. */
const GUIDED_TYPES: ReadonlySet<TaskType> = new Set(["assignment", "project", "presentation", "lab", "exam", "revision"]);

export const INTRO_MINUTES = 30;
/** The intro lands about this long before the deadline… */
const MIN_LEAD_DAYS = 14;
/** …or earlier when the work needs it: roughly a 90-minute session every other day. */
const MINUTES_PER_TWO_DAYS = 90;

export type PhasedChunk = SessionChunk & { phase: SessionPhase | null };

export function isGuidedTask(task: PlannerTask): boolean {
  return GUIDED_TYPES.has(task.taskType);
}

export function phaseChunks(
  task: PlannerTask,
  chunks: SessionChunk[],
  now: EpochMinutes,
  /** The student's minimum session length; the intro is never shorter. */
  minimumSessionMinutes = 0,
): { chunks: PhasedChunk[]; introNotBefore: EpochMinutes | null } {
  const introMinutes = Math.max(INTRO_MINUTES, minimumSessionMinutes);
  if (!isGuidedTask(task) || chunks.length === 0) {
    return { chunks: chunks.map((c) => ({ ...c, phase: null })), introNotBefore: null };
  }

  const total = chunks.reduce((sum, c) => sum + c.minutes, 0);
  const notStarted = task.completedMinutes === 0;

  // A fresh task with enough work gets a separate short intro carved off the front.
  if (notStarted && total >= introMinutes * 3) {
    const rest = [...chunks.map((c) => c.minutes)];
    rest[0] = (rest[0] ?? 0) - introMinutes;
    if ((rest[0] ?? 0) < Math.max(15, minimumSessionMinutes)) {
      // Too small to stand alone: fold it into the next chunk.
      const leftover = rest.shift() ?? 0;
      if (rest.length > 0) rest[0] = (rest[0] ?? 0) + leftover;
    }

    const minutes = [introMinutes, ...rest];
    const phased: PhasedChunk[] = minutes.map((m, index) => ({
      taskId: task.id,
      minutes: m,
      method: chunks[0]!.method,
      index,
      totalChunks: minutes.length,
      phase: index === 0 ? "intro" : index === minutes.length - 1 ? "finish" : "work",
    }));

    let introNotBefore: EpochMinutes | null = null;
    if (task.deadline !== null) {
      const leadDays = Math.max(MIN_LEAD_DAYS, Math.ceil(total / MINUTES_PER_TWO_DAYS) * 2);
      const candidate = task.deadline - leadDays * 1440;
      if (candidate > now) introNotBefore = candidate;
    }
    return { chunks: phased, introNotBefore };
  }

  // Already under way (or small): no intro, but the last session still wraps up.
  return {
    chunks: chunks.map((c, index) => ({
      ...c,
      phase: chunks.length > 1 && index === chunks.length - 1 ? "finish" : "work",
    })),
    introNotBefore: null,
  };
}
