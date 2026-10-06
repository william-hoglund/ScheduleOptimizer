import { describe, expect, it } from "vitest";

import { guidanceKind, sessionPhase } from "@/lib/sessions/session-phase";

describe("stored session phase", () => {
  it("reads the phase the engine recorded in generation_reason", () => {
    expect(sessionPhase(JSON.stringify({ code: "first_available", details: { phase: "intro" } }))).toBe("intro");
    expect(sessionPhase(JSON.stringify({ code: "first_available" }))).toBeNull();
    expect(sessionPhase("not json")).toBeNull();
    expect(sessionPhase(null)).toBeNull();
  });

  it("gives exams revision guidance and everything else coursework guidance", () => {
    expect(guidanceKind("exam")).toBe("exam");
    expect(guidanceKind("revision")).toBe("exam");
    expect(guidanceKind("assignment")).toBe("coursework");
  });
});
