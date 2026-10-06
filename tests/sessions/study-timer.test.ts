import { describe, expect, it } from "vitest";

import { defaultStyleFor, timerPhase } from "@/lib/sessions/study-timer";

const min = (m: number) => m * 60;

describe("study timer", () => {
  it("'my own way' never counts down", () => {
    expect(timerPhase("none", min(70), 90)).toEqual({ kind: "free", round: 1, secondsLeft: null });
  });

  it("pomodoro: 25 focus, 5 break, long break after the 4th round", () => {
    expect(timerPhase("pomodoro", min(10), 120)).toEqual({ kind: "focus", round: 1, secondsLeft: min(15) });
    expect(timerPhase("pomodoro", min(27), 120)).toEqual({ kind: "break", round: 1, secondsLeft: min(3) });
    expect(timerPhase("pomodoro", min(30), 120)).toMatchObject({ kind: "focus", round: 2 });
    // 4 × 25 focus + 3 × 5 break = 115 → the long break starts.
    expect(timerPhase("pomodoro", min(116), 120)).toEqual({ kind: "longBreak", round: 4, secondsLeft: min(14) });
  });

  it("50/10 alternates 50 and 10", () => {
    expect(timerPhase("fifty_ten", min(55), 120)).toEqual({ kind: "break", round: 1, secondsLeft: min(5) });
    expect(timerPhase("fifty_ten", min(61), 120)).toMatchObject({ kind: "focus", round: 2 });
  });

  it("deep work: one block, a wrap-up notice 10 minutes before the end, then overtime", () => {
    expect(timerPhase("ninety_twenty", min(30), 150)).toEqual({ kind: "focus", round: 1, secondsLeft: min(110) });
    expect(timerPhase("ninety_twenty", min(145), 150)).toEqual({ kind: "wrapUp", round: 1, secondsLeft: min(5) });
    expect(timerPhase("ninety_twenty", min(151), 150).kind).toBe("overtime");
  });

  it("52/17 and a custom sprint", () => {
    expect(timerPhase("fifty_two", min(60), 120)).toEqual({ kind: "break", round: 1, secondsLeft: min(9) });
    expect(timerPhase("fifty_two", min(70), 120)).toMatchObject({ kind: "focus", round: 2 });
    expect(timerPhase("sprint", min(10), 120, 45)).toEqual({ kind: "focus", round: 1, secondsLeft: min(35) });
    expect(timerPhase("sprint", min(46), 120, 45).kind).toBe("overtime");
  });

  it("a task's method picks its style, otherwise the account's", () => {
    expect(defaultStyleFor("pomodoro", "none")).toBe("pomodoro");
    expect(defaultStyleFor("deep_work", "none")).toBe("ninety_twenty");
    expect(defaultStyleFor("active_recall", "fifty_ten")).toBe("fifty_ten");
    expect(defaultStyleFor(null, "none")).toBe("none");
  });
});
