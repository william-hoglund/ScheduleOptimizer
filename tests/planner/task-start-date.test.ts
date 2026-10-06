import { describe, expect, it } from "vitest";

import { generatePlan } from "@/lib/planner/generate-plan";
import { input, local, task } from "./helpers";

describe("a task's start date", () => {
  it("schedules nothing before the chosen day, even with free time now", () => {
    const notBefore = local("2026-08-06", "00:00");
    const result = generatePlan(
      input({
        tasks: [
          task({
            estimatedMinutes: 120,
            deadline: local("2026-08-07", "20:00"),
            notBefore,
          }),
        ],
      }),
    );

    expect(result.sessions.length).toBeGreaterThan(0);
    for (const session of result.sessions) expect(session.start).toBeGreaterThanOrEqual(notBefore);
  });

  it("changes nothing when absent", () => {
    const result = generatePlan(
      input({ tasks: [task({ estimatedMinutes: 120, deadline: local("2026-08-07", "20:00") })] }),
    );
    expect(result.sessions.some((session) => session.start < local("2026-08-06", "00:00"))).toBe(true);
  });
});
