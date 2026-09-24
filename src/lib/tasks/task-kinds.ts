import type { TaskType } from "@/lib/supabase/types";

/**
 * Coursework, and the rest of life.
 *
 * Both are tasks, because both take hours out of the same week — a job
 * application that closes on Friday competes with revision for Thursday
 * evening, and a planner that only knows about one of them will keep promising
 * time that was never free.
 *
 * What separates them is only how they are *listed*: coursework belongs to a
 * course and lives under Deadlines, an errand belongs to nobody and lives on
 * the weekly to-do list.
 */

export const COURSEWORK_TYPES = [
  "assignment",
  "exam",
  "reading",
  "project",
  "lab",
  "presentation",
  "revision",
  "other",
] as const satisfies readonly TaskType[];

export const ERRAND_TYPES = ["application", "appointment", "admin", "errand"] as const satisfies
  readonly TaskType[];

export type ErrandType = (typeof ERRAND_TYPES)[number];

export function isErrand(type: TaskType): type is ErrandType {
  return (ERRAND_TYPES as readonly TaskType[]).includes(type);
}

/**
 * How long each kind of thing takes when nobody says.
 *
 * Asking for a duration every time is how a to-do list stops being used, so
 * every type carries an honest default. They are deliberately generous: a plan
 * that reserves ninety minutes for an application and needs sixty is a good
 * afternoon, and the reverse is a missed deadline.
 */
export const DEFAULT_MINUTES: Record<TaskType, number> = {
  // Life
  application: 90,
  appointment: 60,
  admin: 30,
  errand: 45,
  // Coursework
  assignment: 120,
  exam: 120,
  reading: 60,
  project: 180,
  lab: 120,
  presentation: 120,
  revision: 90,
  other: 60,
};

export function defaultMinutesFor(type: TaskType): number {
  return DEFAULT_MINUTES[type];
}

/**
 * The duration to store for a to-do.
 *
 * Zero means "not stated" rather than "instant", which is why it falls back to
 * the default rather than through to the planner as work that takes no time.
 */
export function resolveMinutes(type: TaskType, stated: number | null | undefined): number {
  return stated && stated > 0 ? stated : defaultMinutesFor(type);
}

/**
 * The slot a fixed to-do occupies.
 *
 * A to-do with a time of its own stops being work the planner may place and
 * becomes work it must plan around — the dentist does not move because Thursday
 * was a good evening for statistics. Returns null for anything still floating.
 */
export function fixedTodoWindow(task: {
  taskType: TaskType;
  fixedStartAt: string | null;
  estimatedMinutes: number | null;
}): { startIso: string; endIso: string; minutes: number } | null {
  if (!task.fixedStartAt) return null;

  const start = Date.parse(task.fixedStartAt);
  if (Number.isNaN(start)) return null;

  const minutes = resolveMinutes(task.taskType, task.estimatedMinutes);

  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(start + minutes * 60_000).toISOString(),
    minutes,
  };
}
