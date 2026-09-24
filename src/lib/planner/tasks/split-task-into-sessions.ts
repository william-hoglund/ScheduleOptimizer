import type { PlannerPreferences, PlannerTask, StudyMethod, TaskType } from "../types";

/**
 * Breaking a task into sessions that suit the kind of work it is.
 *
 * A 300-minute task must not become one 300-minute block. Equally, the same
 * generic 50-minute chunk for everything is wrong: reading tolerates longer
 * stretches than active recall, and problem sets need enough runway to get into
 * the work before the block ends.
 */

export type SessionChunk = {
  taskId: string;
  minutes: number;
  method: StudyMethod;
  /** 0-based position within this task's chunks, used for spacing. */
  index: number;
  totalChunks: number;
};

/** Ideal minimum, ideal, and maximum minutes for each method. */
const METHOD_SHAPE: Record<StudyMethod, { min: number; ideal: number; max: number }> = {
  active_recall: { min: 20, ideal: 30, max: 45 },
  spaced_repetition: { min: 15, ideal: 25, max: 40 },
  pomodoro: { min: 25, ideal: 50, max: 75 },
  deep_work: { min: 45, ideal: 90, max: 120 },
  interleaving: { min: 30, ideal: 45, max: 60 },
  group_work: { min: 60, ideal: 90, max: 150 },
};

/** What each kind of work defaults to when the student has not chosen. */
const TYPE_METHOD: Record<TaskType, StudyMethod> = {
  reading: "pomodoro",
  revision: "spaced_repetition",
  exam: "active_recall",
  assignment: "deep_work",
  project: "deep_work",
  lab: "group_work",
  presentation: "deep_work",
  other: "pomodoro",
  /**
   * Errands are not studying, so the "method" is a formality — but the field is
   * shared, and an application does want an uninterrupted stretch.
   */
  application: "deep_work",
  appointment: "pomodoro",
  admin: "pomodoro",
  errand: "pomodoro",
};

export function methodFor(task: PlannerTask): StudyMethod {
  return task.preferredStudyMethod ?? TYPE_METHOD[task.taskType];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Chunk length for a task, reconciling three things that can disagree: the
 * method's natural rhythm, the student's stated preference, and their hard
 * minimum and maximum.
 */
function chunkLengthFor(
  task: PlannerTask,
  preferences: PlannerPreferences,
  urgent: boolean,
): number {
  const shape = METHOD_SHAPE[methodFor(task)];

  // Meet the method and the student halfway rather than letting either win
  // outright — a Pomodoro person doing deep work still wants longer blocks.
  let target = Math.round((shape.ideal + preferences.preferredSessionMinutes) / 2);

  // Hard work benefits from longer runs; light work is fine in shorter ones.
  if (task.difficulty >= 4) target = Math.round(target * 1.2);
  if (task.difficulty <= 2) target = Math.round(target * 0.9);

  // Close to a deadline, fewer and longer blocks beat many fragments.
  if (urgent) target = Math.round(target * 1.25);

  return clamp(
    target,
    Math.max(preferences.minimumSessionMinutes, shape.min),
    Math.min(preferences.maximumSessionMinutes, shape.max),
  );
}

/**
 * Splits the remaining work into chunks.
 *
 * A trailing remainder shorter than the student's minimum session is folded
 * into the previous chunk instead of becoming a pointless ten-minute block.
 */
export function splitTaskIntoSessions(
  task: PlannerTask,
  remainingMinutes: number,
  preferences: PlannerPreferences,
  { urgent = false }: { urgent?: boolean } = {},
): SessionChunk[] {
  if (remainingMinutes <= 0) return [];

  const method = methodFor(task);
  const chunkLength = chunkLengthFor(task, preferences, urgent);

  // Work shorter than one chunk is a single session, provided it clears the
  // student's minimum; below that it is not worth a calendar entry on its own.
  if (remainingMinutes <= chunkLength) {
    const minutes = Math.max(remainingMinutes, 0);
    if (minutes < preferences.minimumSessionMinutes && minutes < remainingMinutes) return [];
    return [{ taskId: task.id, minutes, method, index: 0, totalChunks: 1 }];
  }

  const chunks: number[] = [];
  let left = remainingMinutes;

  while (left > 0) {
    const take = Math.min(chunkLength, left);
    chunks.push(take);
    left -= take;
  }

  const last = chunks[chunks.length - 1];
  if (chunks.length > 1 && last !== undefined && last < preferences.minimumSessionMinutes) {
    chunks.pop();
    const previousIndex = chunks.length - 1;
    const previous = chunks[previousIndex];
    if (previous !== undefined) {
      // May exceed the preferred length slightly; still better than a stub, and
      // the hard maximum is respected below.
      chunks[previousIndex] = Math.min(
        previous + last,
        Math.max(preferences.maximumSessionMinutes, previous),
      );
    }
  }

  return chunks.map((minutes, index) => ({
    taskId: task.id,
    minutes,
    method,
    index,
    totalChunks: chunks.length,
  }));
}

/**
 * Revision intervals for spaced repetition, in days before the deadline.
 *
 * Reversed from the brief's forward schedule (same day, +1, +3, +7, +14) so the
 * passes land close to the exam, where they do the most good.
 */
export const SPACED_REPETITION_OFFSETS_DAYS = [14, 7, 3, 1, 0] as const;
