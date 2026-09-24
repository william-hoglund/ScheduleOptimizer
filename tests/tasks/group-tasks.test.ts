import { describe, expect, it } from "vitest";

import { daysUntil, groupForTask, groupTasks } from "@/lib/tasks/group-tasks";

const STOCKHOLM = "Europe/Stockholm";
const NOW = "2026-08-01T12:00:00.000Z"; // Saturday 14:00 in Stockholm

const task = (deadline: string | null, status = "not_started") => ({ deadline, status });

describe("daysUntil", () => {
  it("counts whole calendar days in the student's zone", () => {
    expect(daysUntil("2026-08-01T20:00:00.000Z", NOW, STOCKHOLM)).toBe(0);
    expect(daysUntil("2026-08-02T08:00:00.000Z", NOW, STOCKHOLM)).toBe(1);
    expect(daysUntil("2026-08-08T08:00:00.000Z", NOW, STOCKHOLM)).toBe(7);
  });

  it("uses the local calendar day, not the UTC one", () => {
    // 22:30 UTC on the 1st is already the 2nd in Stockholm, so it is tomorrow
    // even though UTC still calls it today.
    expect(daysUntil("2026-08-01T22:30:00.000Z", NOW, STOCKHOLM)).toBe(1);
  });

  it("is negative for past deadlines", () => {
    expect(daysUntil("2026-07-30T08:00:00.000Z", NOW, STOCKHOLM)).toBe(-2);
  });
});

describe("groupForTask", () => {
  it("treats a passed instant as overdue even on the same day", () => {
    expect(groupForTask(task("2026-08-01T09:00:00.000Z"), NOW, STOCKHOLM)).toBe("overdue");
  });

  it("keeps a later time today out of overdue", () => {
    expect(groupForTask(task("2026-08-01T20:00:00.000Z"), NOW, STOCKHOLM)).toBe("thisWeek");
  });

  it("splits this week from later at seven days", () => {
    expect(groupForTask(task("2026-08-08T10:00:00.000Z"), NOW, STOCKHOLM)).toBe("thisWeek");
    expect(groupForTask(task("2026-08-09T10:00:00.000Z"), NOW, STOCKHOLM)).toBe("later");
  });

  it("puts undated work in its own bucket", () => {
    expect(groupForTask(task(null), NOW, STOCKHOLM)).toBe("noDeadline");
  });

  it("counts completed and cancelled as done, however overdue", () => {
    expect(groupForTask(task("2026-01-01T10:00:00.000Z", "completed"), NOW, STOCKHOLM)).toBe(
      "completed",
    );
    expect(groupForTask(task("2026-01-01T10:00:00.000Z", "cancelled"), NOW, STOCKHOLM)).toBe(
      "completed",
    );
  });
});

describe("groupTasks", () => {
  it("returns every bucket, empty ones included, in a stable order", () => {
    const grouped = groupTasks(
      [
        task("2026-07-20T10:00:00.000Z"),
        task("2026-08-03T10:00:00.000Z"),
        task("2026-09-01T10:00:00.000Z"),
        task(null),
        task("2026-08-03T10:00:00.000Z", "completed"),
      ],
      NOW,
      STOCKHOLM,
    );

    expect([...grouped.keys()]).toEqual([
      "overdue",
      "thisWeek",
      "later",
      "noDeadline",
      "completed",
    ]);
    expect(grouped.get("overdue")).toHaveLength(1);
    expect(grouped.get("thisWeek")).toHaveLength(1);
    expect(grouped.get("later")).toHaveLength(1);
    expect(grouped.get("noDeadline")).toHaveLength(1);
    expect(grouped.get("completed")).toHaveLength(1);
  });
});
