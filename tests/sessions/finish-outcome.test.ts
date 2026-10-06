import { describe, expect, it } from "vitest";

import { finishOutcome } from "@/lib/sessions/finish-outcome";

const start = "2026-10-06T10:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString();

describe("finishing a started session", () => {
  it("is completed at or past the plan, capped at the planned minutes", () => {
    expect(finishOutcome(start, at(50), 50)).toEqual({ status: "completed", minutes: 50 });
    expect(finishOutcome(start, at(75), 50)).toEqual({ status: "completed", minutes: 50 });
  });

  it("is partial when short, recording the real minutes", () => {
    expect(finishOutcome(start, at(20), 50)).toEqual({ status: "partial", minutes: 20 });
  });

  it("records at least one minute", () => {
    expect(finishOutcome(start, at(0), 50)).toEqual({ status: "partial", minutes: 1 });
  });
});
