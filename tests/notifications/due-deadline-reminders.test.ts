import { describe, expect, it } from "vitest";

import { selectDueDeadlineReminders, type ReminderCandidateTask } from "@/lib/notifications/due-deadline-reminders";

const NOW = "2026-09-23T12:00:00.000Z";

function task(id: string, deadlineIso: string): ReminderCandidateTask {
  return { id, deadlineIso };
}

describe("selectDueDeadlineReminders", () => {
  it("selects a task whose deadline falls inside the lead window", () => {
    const result = selectDueDeadlineReminders({
      tasks: [task("t1", "2026-09-25T12:00:00.000Z")], // 2 days out
      alreadyNotifiedTaskIds: new Set(),
      leadDays: 3,
      nowIso: NOW,
    });
    expect(result).toEqual(["t1"]);
  });

  it("excludes a deadline further out than the lead window", () => {
    const result = selectDueDeadlineReminders({
      tasks: [task("t1", "2026-09-30T12:00:00.000Z")], // 7 days out
      alreadyNotifiedTaskIds: new Set(),
      leadDays: 3,
      nowIso: NOW,
    });
    expect(result).toEqual([]);
  });

  it("excludes a deadline that has already passed", () => {
    const result = selectDueDeadlineReminders({
      tasks: [task("t1", "2026-09-20T12:00:00.000Z")], // 3 days ago
      alreadyNotifiedTaskIds: new Set(),
      leadDays: 3,
      nowIso: NOW,
    });
    expect(result).toEqual([]);
  });

  it("never re-selects a task that already has a reminder", () => {
    const result = selectDueDeadlineReminders({
      tasks: [task("t1", "2026-09-25T12:00:00.000Z")],
      alreadyNotifiedTaskIds: new Set(["t1"]),
      leadDays: 3,
      nowIso: NOW,
    });
    expect(result).toEqual([]);
  });

  it("is inclusive right at the edge of the lead window", () => {
    const result = selectDueDeadlineReminders({
      tasks: [task("t1", "2026-09-26T12:00:00.000Z")], // exactly 3 days out
      alreadyNotifiedTaskIds: new Set(),
      leadDays: 3,
      nowIso: NOW,
    });
    expect(result).toEqual(["t1"]);
  });

  it("only selects tasks that qualify, out of a mixed list", () => {
    const result = selectDueDeadlineReminders({
      tasks: [
        task("soon", "2026-09-24T12:00:00.000Z"),
        task("far", "2026-10-10T12:00:00.000Z"),
        task("past", "2026-09-01T12:00:00.000Z"),
      ],
      alreadyNotifiedTaskIds: new Set(),
      leadDays: 3,
      nowIso: NOW,
    });
    expect(result).toEqual(["soon"]);
  });
});
