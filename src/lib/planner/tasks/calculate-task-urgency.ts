import { MINUTES_PER_DAY } from "../time-grid";
import type { EpochMinutes, PlannerTask } from "../types";

/**
 * How badly each task needs attention.
 *
 * The score is a sum of weighted components rather than a single rule, so the
 * reason a task rose to the top can be explained back to the student — which is
 * what the planner's "why is this here?" text is built from.
 */

export type TaskPriority = {
  taskId: string;
  total: number;
  components: {
    urgency: number;
    importance: number;
    coursePriority: number;
    difficulty: number;
    remainingWork: number;
    fallingBehind: number;
    dependency: number;
  };
  remainingMinutes: number;
  /** The internal deadline the engine actually aims at. */
  targetDeadline: EpochMinutes | null;
  daysUntilTarget: number | null;
};

const WEIGHTS = {
  urgency: 40,
  importance: 20,
  coursePriority: 12,
  difficulty: 8,
  remainingWork: 10,
  fallingBehind: 25,
  dependency: 15,
} as const;

/** Graded work matters more than a reading nobody checks. */
const TYPE_IMPORTANCE: Record<PlannerTask["taskType"], number> = {
  exam: 1,
  project: 0.85,
  assignment: 0.8,
  presentation: 0.75,
  lab: 0.7,
  revision: 0.5,
  reading: 0.45,
  other: 0.4,
  // Life. An application that closes is as unforgiving as an exam; a form is
  // not, but it still has to happen.
  application: 0.9,
  appointment: 0.8,
  admin: 0.5,
  errand: 0.45,
};

export function remainingMinutesFor(task: PlannerTask): number {
  return Math.max(0, task.estimatedMinutes - task.completedMinutes);
}

/**
 * An internal deadline earlier than the real one.
 *
 * Scheduling work right up to the deadline leaves no room for the day something
 * goes wrong. The buffer grows with the size of the task, because a large piece
 * of work is also a more uncertain estimate — but it is capped so a huge task
 * does not end up due absurdly early.
 */
export function targetDeadlineFor(
  task: PlannerTask,
  bufferPercentage: number,
): EpochMinutes | null {
  if (task.deadline === null) return null;

  const remaining = remainingMinutesFor(task);
  const share = Math.min(Math.max(bufferPercentage, 0), 50) / 100;
  const bufferMinutes = Math.min(remaining * share, 3 * MINUTES_PER_DAY);

  return Math.round(task.deadline - bufferMinutes);
}

/**
 * Urgency rises sharply as the deadline nears.
 *
 * Deliberately not linear: the brief asks that two days versus one matters far
 * more than thirty versus twenty-nine. A reciprocal curve does that — 1 day
 * scores 0.50, 2 days 0.33, while 29 and 30 days differ by 0.001.
 */
function urgencyFromDays(days: number): number {
  if (days <= 0) return 1;
  return 1 / (days + 1);
}

/**
 * Whether the work still fits comfortably in the time left.
 *
 * Compares what remains against a rough sense of how much study time the days
 * before the target could hold. Past 1 the task is no longer comfortable, and
 * the score climbs steeply.
 */
function fallingBehindPressure(
  remaining: number,
  daysUntilTarget: number | null,
  dailyCapacity: number,
): number {
  if (daysUntilTarget === null) return 0;
  if (daysUntilTarget <= 0) return 1;

  const capacity = Math.max(1, daysUntilTarget * dailyCapacity);
  const pressure = remaining / capacity;

  return Math.min(1, Math.max(0, pressure));
}

export function calculateTaskUrgency(
  task: PlannerTask,
  {
    now,
    bufferPercentage,
    maximumDailyMinutes,
    blockedByCount,
  }: {
    now: EpochMinutes;
    bufferPercentage: number;
    maximumDailyMinutes: number;
    /** How many other tasks are waiting on this one. */
    blockedByCount: number;
  },
): TaskPriority {
  const remainingMinutes = remainingMinutesFor(task);
  const targetDeadline = targetDeadlineFor(task, bufferPercentage);

  const daysUntilTarget = targetDeadline === null ? null : (targetDeadline - now) / MINUTES_PER_DAY;

  const urgency = daysUntilTarget === null ? 0.1 : urgencyFromDays(daysUntilTarget);
  const importance = TYPE_IMPORTANCE[task.taskType] * (task.priority / 5);
  const coursePriority = task.coursePriority / 5;
  const difficulty = task.difficulty / 5;

  // Normalised against a full day's study, capped so one enormous task cannot
  // swamp every other signal.
  const remainingWork = Math.min(1, remainingMinutes / Math.max(1, maximumDailyMinutes * 2));

  const fallingBehind = fallingBehindPressure(
    remainingMinutes,
    daysUntilTarget,
    maximumDailyMinutes,
  );

  // Work that unblocks other work earns a nudge, so chains start early enough.
  const dependency = Math.min(1, blockedByCount / 3);

  const components = {
    urgency: urgency * WEIGHTS.urgency,
    importance: importance * WEIGHTS.importance,
    coursePriority: coursePriority * WEIGHTS.coursePriority,
    difficulty: difficulty * WEIGHTS.difficulty,
    remainingWork: remainingWork * WEIGHTS.remainingWork,
    fallingBehind: fallingBehind * WEIGHTS.fallingBehind,
    dependency: dependency * WEIGHTS.dependency,
  };

  const total = Object.values(components).reduce((sum, value) => sum + value, 0);

  return {
    taskId: task.id,
    total,
    components,
    remainingMinutes,
    targetDeadline,
    daysUntilTarget,
  };
}

/**
 * Tasks that must finish before others can start, and how many wait on each.
 *
 * Also reports cycles rather than looping forever — a student can easily create
 * one by hand, and it must degrade into a warning, not a hang.
 */
export function analyseDependencies(tasks: readonly PlannerTask[]): {
  blockedByCount: Map<string, number>;
  cycleTaskIds: string[];
} {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const blockedByCount = new Map<string, number>();

  for (const task of tasks) {
    for (const dependencyId of task.dependsOn) {
      if (!byId.has(dependencyId)) continue;
      blockedByCount.set(dependencyId, (blockedByCount.get(dependencyId) ?? 0) + 1);
    }
  }

  // Iterative depth-first search with colouring: white unvisited, grey on the
  // current path, black finished. Meeting grey means the path loops.
  const colour = new Map<string, "grey" | "black">();
  const cycleTaskIds = new Set<string>();

  const visit = (startId: string) => {
    const stack: Array<{ id: string; phase: "enter" | "exit" }> = [{ id: startId, phase: "enter" }];

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) break;

      if (frame.phase === "exit") {
        colour.set(frame.id, "black");
        continue;
      }

      const current = colour.get(frame.id);
      if (current === "black") continue;
      if (current === "grey") {
        cycleTaskIds.add(frame.id);
        continue;
      }

      colour.set(frame.id, "grey");
      stack.push({ id: frame.id, phase: "exit" });

      for (const dependencyId of byId.get(frame.id)?.dependsOn ?? []) {
        if (!byId.has(dependencyId)) continue;
        if (colour.get(dependencyId) === "grey") {
          cycleTaskIds.add(dependencyId);
          continue;
        }
        stack.push({ id: dependencyId, phase: "enter" });
      }
    }
  };

  for (const task of tasks) {
    if (!colour.has(task.id)) visit(task.id);
  }

  return { blockedByCount, cycleTaskIds: [...cycleTaskIds] };
}
