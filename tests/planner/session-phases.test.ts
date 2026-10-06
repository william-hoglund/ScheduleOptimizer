import { describe, expect, it } from "vitest";

import { generatePlan } from "@/lib/planner/generate-plan";
import { phaseChunks } from "@/lib/planner/tasks/session-phases";
import type { SessionChunk } from "@/lib/planner/tasks/split-task-into-sessions";
import { input, local, preferences, task } from "./helpers";

const chunks = (...minutes: number[]): SessionChunk[] =>
  minutes.map((m, index) => ({ taskId: "t", minutes: m, method: "deep_work", index, totalChunks: minutes.length }));

describe("guided session phases", () => {
  it("carves a 30-minute intro off a fresh assignment and ends with a finish session", () => {
    const { chunks: phased } = phaseChunks(task({ id: "t", completedMinutes: 0 }), chunks(90, 90, 90), 0);
    expect(phased.map((c) => [c.minutes, c.phase])).toEqual([
      [30, "intro"],
      [60, "work"],
      [90, "work"],
      [90, "finish"],
    ]);
    expect(phased.reduce((sum, c) => sum + c.minutes, 0)).toBe(270);
  });

  it("puts the intro about two weeks before the deadline, or earlier for big work", () => {
    const deadline = 100 * 1440;
    const small = phaseChunks(task({ deadline }), chunks(90, 90, 90), 0);
    expect(small.introNotBefore).toBe(deadline - 14 * 1440);

    const big = phaseChunks(task({ deadline }), chunks(...Array(20).fill(90)), 0);
    expect(big.introNotBefore).toBe(deadline - 40 * 1440);
  });

  it("skips the intro once work has started, and for non-coursework", () => {
    expect(phaseChunks(task({ completedMinutes: 60 }), chunks(90, 90), 0).chunks.map((c) => c.phase)).toEqual(["work", "finish"]);
    expect(phaseChunks(task({ taskType: "reading" }), chunks(90, 90), 0).chunks.map((c) => c.phase)).toEqual([null, null]);
  });

  it("never makes the intro shorter than the student's minimum session", () => {
    const { chunks: phased } = phaseChunks(task(), chunks(90, 90, 90), 0, 45);
    expect(phased[0]).toMatchObject({ minutes: 45, phase: "intro" });
  });

  it("in a real plan, the intro comes first and nothing is scheduled before it", () => {
    const result = generatePlan(
      input({
        preferences: preferences({ breakMethod: "none", preferredSessionMinutes: 60, maximumSessionMinutes: 120 }),
        tasks: [task({ id: "a", estimatedMinutes: 240, deadline: local("2026-08-07", "17:00") })],
      }),
    );
    const own = result.sessions.filter((s) => s.taskId === "a").sort((x, y) => x.start - y.start);
    expect(own[0]?.phase).toBe("intro");
    expect(own[own.length - 1]?.phase).toBe("finish");
    expect(own[0]?.reason.details?.phase).toBe("intro");
  });
});
