import { describe, expect, it } from "vitest";

import { groupTodos, minutesThisWeek } from "@/lib/tasks/group-todos";
import type { TaskRow } from "@/lib/supabase/types";

const STOCKHOLM = "Europe/Stockholm";

/** Thursday 6 August 2026, 10:00 local (08:00Z in summer). */
const NOW = "2026-08-06T08:00:00.000Z";

function todo(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "todo-1",
    user_id: "user-1",
    course_id: null,
    parent_task_id: null,
    title: "Send application",
    description: null,
    task_type: "application",
    status: "not_started",
    priority: 3,
    difficulty: 3,
    deadline: null,
    fixed_start_at: null,
    estimated_minutes: 90,
    completed_minutes: 0,
    remaining_minutes: 90,
    preferred_study_method: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  } as TaskRow;
}

describe("groupTodos", () => {
  it("separates a week into the order it is lived in", () => {
    const grouped = groupTodos(
      [
        todo({ id: "later", deadline: "2026-08-20T08:00:00.000Z" }),
        todo({ id: "today", deadline: "2026-08-06T16:00:00.000Z" }),
        todo({ id: "overdue", deadline: "2026-08-04T08:00:00.000Z" }),
        todo({ id: "someday" }),
        todo({ id: "week", deadline: "2026-08-08T08:00:00.000Z" }),
        todo({ id: "done", status: "completed", deadline: "2026-08-05T08:00:00.000Z" }),
      ],
      NOW,
      STOCKHOLM,
    );

    expect(grouped.map((item) => item.task.id)).toEqual([
      "overdue",
      "today",
      "week",
      "later",
      "someday",
      "done",
    ]);
  });

  it("judges overdue on the instant, not the date", () => {
    // Due at 16:00 today; at 10:00 it is not overdue, whatever the date says.
    const [item] = groupTodos([todo({ deadline: "2026-08-06T14:00:00.000Z" })], NOW, STOCKHOLM);
    expect(item?.bucket).toBe("today");
  });

  it("ends the week on Sunday night, not seven days out", () => {
    // Thursday 6 August 2026; Sunday the 9th is this week, Monday the 10th is not.
    const [sunday] = groupTodos([todo({ deadline: "2026-08-09T18:00:00.000Z" })], NOW, STOCKHOLM);
    const [monday] = groupTodos([todo({ deadline: "2026-08-10T06:00:00.000Z" })], NOW, STOCKHOLM);

    expect(sunday?.bucket).toBe("thisWeek");
    expect(monday?.bucket).toBe("later");
  });

  it("uses the local date, so late-evening items do not slip a day", () => {
    // 23:30 Stockholm on the 6th is 21:30Z the same day — but a naive UTC
    // reading of a 00:30 local time would land on the wrong date entirely.
    const [item] = groupTodos([todo({ deadline: "2026-08-06T21:30:00.000Z" })], NOW, STOCKHOLM);
    expect(item?.bucket).toBe("today");
  });

  it("marks a fixed time as fixed, and prefers it over a deadline", () => {
    const [item] = groupTodos(
      [todo({ fixed_start_at: "2026-08-06T12:00:00.000Z", task_type: "appointment" })],
      NOW,
      STOCKHOLM,
    );

    expect(item?.atFixedTime).toBe(true);
    expect(item?.whenIso).toBe("2026-08-06T12:00:00.000Z");
  });

  it("keeps undated work last inside its group", () => {
    const grouped = groupTodos([todo({ id: "a" }), todo({ id: "b" })], NOW, STOCKHOLM);
    expect(grouped.every((item) => item.bucket === "someday")).toBe(true);
  });
});

describe("minutesThisWeek", () => {
  it("counts what is still to do now, not what is finished or far off", () => {
    const grouped = groupTodos(
      [
        todo({ id: "overdue", deadline: "2026-08-04T08:00:00.000Z", estimated_minutes: 30 }),
        todo({ id: "today", deadline: "2026-08-06T16:00:00.000Z", estimated_minutes: 60 }),
        todo({ id: "week", deadline: "2026-08-08T08:00:00.000Z", estimated_minutes: 90 }),
        todo({ id: "later", deadline: "2026-08-25T08:00:00.000Z", estimated_minutes: 120 }),
        todo({ id: "done", status: "completed", estimated_minutes: 500 }),
      ],
      NOW,
      STOCKHOLM,
    );

    expect(minutesThisWeek(grouped)).toBe(180);
  });
});
