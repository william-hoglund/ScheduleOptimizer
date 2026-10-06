import { describe, expect, it } from "vitest";

import { splitTaskIntoSessions } from "@/lib/planner/tasks/split-task-into-sessions";
import { preferences, task } from "./helpers";

/**
 * A task's own `preferredSessionMinutes` — "long sessions for the final
 * project" — overrides the account-wide default for that task alone, and
 * can widen past the account's own session-length cap to actually be
 * honoured (see split-task-into-sessions.ts's own comment on why).
 */
describe("splitTaskIntoSessions — a task's own preferred session length", () => {
  it("chunks at the task's override instead of the account default", () => {
    const prefs = preferences({
      preferredSessionMinutes: 50,
      minimumSessionMinutes: 25,
      maximumSessionMinutes: 120,
    });
    const longSessionTask = task({
      preferredSessionMinutes: 100,
      estimatedMinutes: 300,
      difficulty: 3, // no difficulty nudge, to isolate the override itself
    });

    const chunks = splitTaskIntoSessions(longSessionTask, 300, prefs);

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks.slice(0, -1)) {
      // Every full chunk should land at (or very near) the 100-minute
      // override, not the account's 50-minute default.
      expect(chunk.minutes).toBeGreaterThanOrEqual(90);
    }
  });

  it("widens past the account's maximum session length when explicitly asked to", () => {
    const prefs = preferences({
      preferredSessionMinutes: 50,
      minimumSessionMinutes: 25,
      maximumSessionMinutes: 90, // the account cap this override must beat
    });
    const longSessionTask = task({
      preferredSessionMinutes: 180,
      estimatedMinutes: 360,
      taskType: "project", // deep_work's own shape.max (120) must be beaten too
      difficulty: 3,
    });

    const chunks = splitTaskIntoSessions(longSessionTask, 360, prefs);

    const longest = Math.max(...chunks.map((c) => c.minutes));
    expect(longest).toBeGreaterThan(90);
  });

  it("falls back to the account default when the task sets no preference", () => {
    const prefs = preferences({ preferredSessionMinutes: 50, breakMethod: "none" });
    const defaultTask = task({ preferredSessionMinutes: null, estimatedMinutes: 300, difficulty: 3 });
    const overriddenTask = task({ preferredSessionMinutes: 100, estimatedMinutes: 300, difficulty: 3 });

    const defaultChunks = splitTaskIntoSessions(defaultTask, 300, prefs);
    const overriddenChunks = splitTaskIntoSessions(overriddenTask, 300, prefs);

    expect(defaultChunks[0]?.minutes).toBeLessThan(overriddenChunks[0]?.minutes ?? 0);
  });
});
