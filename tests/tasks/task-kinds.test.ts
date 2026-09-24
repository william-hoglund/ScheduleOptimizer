import { describe, expect, it } from "vitest";

import {
  COURSEWORK_TYPES,
  DEFAULT_MINUTES,
  ERRAND_TYPES,
  defaultMinutesFor,
  fixedTodoWindow,
  isErrand,
  resolveMinutes,
} from "@/lib/tasks/task-kinds";

describe("task kinds", () => {
  it("separates life from coursework without overlap", () => {
    const overlap = (ERRAND_TYPES as readonly string[]).filter((type) =>
      (COURSEWORK_TYPES as readonly string[]).includes(type),
    );
    expect(overlap).toEqual([]);
  });

  it("knows an errand from a piece of coursework", () => {
    expect(isErrand("appointment")).toBe(true);
    expect(isErrand("application")).toBe(true);
    expect(isErrand("assignment")).toBe(false);
    expect(isErrand("exam")).toBe(false);
  });

  it("gives every type a default, so a to-do never has to be measured", () => {
    for (const type of [...ERRAND_TYPES, ...COURSEWORK_TYPES]) {
      expect(defaultMinutesFor(type)).toBeGreaterThan(0);
    }
    expect(Object.keys(DEFAULT_MINUTES)).toHaveLength(
      ERRAND_TYPES.length + COURSEWORK_TYPES.length,
    );
  });

  it("uses the stated duration when there is one", () => {
    expect(resolveMinutes("application", 45)).toBe(45);
  });

  it("falls back when the duration is missing, zero or nonsense", () => {
    // Zero means "not stated", not "takes no time" — otherwise the planner
    // would treat a dentist appointment as free.
    expect(resolveMinutes("appointment", 0)).toBe(60);
    expect(resolveMinutes("appointment", null)).toBe(60);
    expect(resolveMinutes("appointment", undefined)).toBe(60);
    expect(resolveMinutes("admin", -30)).toBe(30);
  });
});

describe("fixedTodoWindow", () => {
  it("turns a to-do with a time into the slot it occupies", () => {
    expect(
      fixedTodoWindow({
        taskType: "appointment",
        fixedStartAt: "2026-08-06T12:00:00.000Z",
        estimatedMinutes: 0,
      }),
    ).toEqual({
      startIso: "2026-08-06T12:00:00.000Z",
      // An hour, from the default: nobody types a duration for the dentist.
      endIso: "2026-08-06T13:00:00.000Z",
      minutes: 60,
    });
  });

  it("respects a duration the student did give", () => {
    expect(
      fixedTodoWindow({
        taskType: "admin",
        fixedStartAt: "2026-08-06T12:00:00.000Z",
        estimatedMinutes: 15,
      })?.minutes,
    ).toBe(15);
  });

  it("returns nothing for a to-do that is still floating", () => {
    expect(
      fixedTodoWindow({ taskType: "application", fixedStartAt: null, estimatedMinutes: 90 }),
    ).toBeNull();
  });
});
