import { utcToLocalDate } from "@/lib/calendar/time";

/**
 * Sorting tasks into the buckets the deadlines page shows.
 *
 * Pure and timezone-aware: "today" means the student's calendar day, not the
 * server's. A deadline at 00:30 Stockholm time is still today for them even
 * though it is yesterday in UTC.
 */

export type TaskGroupKey = "overdue" | "thisWeek" | "later" | "noDeadline" | "completed";

export const TASK_GROUP_ORDER: readonly TaskGroupKey[] = [
  "overdue",
  "thisWeek",
  "later",
  "noDeadline",
  "completed",
];

type GroupableTask = {
  deadline: string | null;
  status: string;
};

/** Whole calendar days between two instants, counted in the student's zone. */
export function daysUntil(deadlineIso: string, nowIso: string, timeZone: string): number {
  const deadlineDay = utcToLocalDate(deadlineIso, timeZone);
  const today = utcToLocalDate(nowIso, timeZone);

  // Comparing at UTC midnight of each local calendar date avoids counting a
  // partial day as a whole one.
  const a = Date.parse(`${deadlineDay}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);

  return Math.round((a - b) / 86_400_000);
}

export function groupForTask(task: GroupableTask, nowIso: string, timeZone: string): TaskGroupKey {
  if (task.status === "completed" || task.status === "cancelled") return "completed";
  if (!task.deadline) return "noDeadline";

  // Overdue is measured against the actual instant, not the calendar day: a
  // deadline at 09:00 that it is now 17:00 is late, even though it is still
  // "today".
  if (new Date(task.deadline).getTime() < new Date(nowIso).getTime()) return "overdue";

  return daysUntil(task.deadline, nowIso, timeZone) <= 7 ? "thisWeek" : "later";
}

export function groupTasks<T extends GroupableTask>(
  tasks: readonly T[],
  nowIso: string,
  timeZone: string,
): Map<TaskGroupKey, T[]> {
  const groups = new Map<TaskGroupKey, T[]>();

  for (const key of TASK_GROUP_ORDER) groups.set(key, []);
  for (const task of tasks) {
    groups.get(groupForTask(task, nowIso, timeZone))?.push(task);
  }

  return groups;
}
