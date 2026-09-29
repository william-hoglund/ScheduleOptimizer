/**
 * Which tasks get a deadline reminder on this dispatch tick.
 *
 * Pure — the actual database I/O (loading tasks, loading which task ids
 * already have a reminder, writing the new ones) lives in
 * `server/notification-dispatch-service.ts`. This is just the decision,
 * which is what's worth pinning with a test independent of any database.
 */

export type ReminderCandidateTask = {
  id: string;
  /** ISO instant. */
  deadlineIso: string;
};

export function selectDueDeadlineReminders({
  tasks,
  alreadyNotifiedTaskIds,
  leadDays,
  nowIso,
}: {
  /** Already scoped to one user, with undated/completed/cancelled tasks excluded. */
  tasks: readonly ReminderCandidateTask[];
  alreadyNotifiedTaskIds: ReadonlySet<string>;
  leadDays: number;
  nowIso: string;
}): string[] {
  const now = Date.parse(nowIso);
  const threshold = now + leadDays * 86_400_000;

  return tasks
    .filter((task) => !alreadyNotifiedTaskIds.has(task.id))
    .filter((task) => {
      const deadline = Date.parse(task.deadlineIso);
      // Inside the lead window, and not a deadline that has already
      // passed — a reminder for missed work is pointless, not urgent.
      return deadline >= now && deadline <= threshold;
    })
    .map((task) => task.id);
}
