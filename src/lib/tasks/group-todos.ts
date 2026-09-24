import type { TaskRow } from "@/lib/supabase/types";
import { utcToLocalDate } from "@/lib/calendar/time";

/**
 * Sorting a to-do list into the order a week is actually lived in.
 *
 * Pure, so the boundaries can be pinned: "this week" ends on Sunday night in
 * the student's own zone, not 168 hours from whenever the page was opened.
 */

export type TodoBucket = "overdue" | "today" | "thisWeek" | "later" | "someday" | "done";

export type GroupedTodo = {
  task: TaskRow;
  bucket: TodoBucket;
  /** When it happens or is due, whichever applies. Null for a floating to-do. */
  whenIso: string | null;
  /** True when the time is fixed — an appointment rather than a deadline. */
  atFixedTime: boolean;
};

export const BUCKET_ORDER: readonly TodoBucket[] = [
  "overdue",
  "today",
  "thisWeek",
  "later",
  "someday",
  "done",
];

/** The last local date of the week `date` falls in, Monday-based. */
function endOfWeek(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const isoWeekday = day === 0 ? 7 : day;
  const until = new Date(Date.parse(`${date}T00:00:00Z`) + (7 - isoWeekday) * 86_400_000);
  return until.toISOString().slice(0, 10);
}

export function groupTodos(
  todos: readonly TaskRow[],
  nowIso: string,
  timeZone: string,
): GroupedTodo[] {
  const today = utcToLocalDate(nowIso, timeZone);
  const weekEnd = endOfWeek(today);

  return todos
    .map((task): GroupedTodo => {
      const whenIso = task.fixed_start_at || task.deadline;
      const atFixedTime = Boolean(task.fixed_start_at);

      if (task.status === "completed" || task.status === "cancelled") {
        return { task, bucket: "done", whenIso, atFixedTime };
      }

      // Nothing to do it by. Still real work, still planned — just not urgent.
      if (!whenIso) return { task, bucket: "someday", whenIso, atFixedTime };

      const date = utcToLocalDate(whenIso, timeZone);

      // Overdue is decided on the instant, not the date: something due at 09:00
      // is not overdue at 08:00 merely because it is the same day.
      if (whenIso < nowIso) return { task, bucket: "overdue", whenIso, atFixedTime };
      if (date === today) return { task, bucket: "today", whenIso, atFixedTime };
      if (date <= weekEnd) return { task, bucket: "thisWeek", whenIso, atFixedTime };

      return { task, bucket: "later", whenIso, atFixedTime };
    })
    .sort((a, b) => {
      const byBucket = BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket);
      if (byBucket !== 0) return byBucket;

      // Undated work sorts last within its group rather than first.
      if (a.whenIso === null) return b.whenIso === null ? 0 : 1;
      if (b.whenIso === null) return -1;
      return a.whenIso.localeCompare(b.whenIso);
    });
}

/** Minutes of unfinished work this week, for the line that says how full it is. */
export function minutesThisWeek(grouped: readonly GroupedTodo[]): number {
  return grouped
    .filter((item) => item.bucket === "overdue" || item.bucket === "today" || item.bucket === "thisWeek")
    .reduce((sum, item) => sum + item.task.estimated_minutes, 0);
}
