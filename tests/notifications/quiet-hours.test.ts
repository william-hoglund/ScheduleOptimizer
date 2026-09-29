import { describe, expect, it } from "vitest";

import { isWithinQuietHours } from "@/lib/notifications/quiet-hours";

describe("isWithinQuietHours", () => {
  it("is never quiet when nothing is configured", () => {
    expect(isWithinQuietHours({ nowLocalTime: "23:30", quietStart: null, quietEnd: null })).toBe(false);
  });

  it("treats an ordinary same-day window as inside start-to-end", () => {
    expect(
      isWithinQuietHours({ nowLocalTime: "13:30", quietStart: "13:00", quietEnd: "14:00" }),
    ).toBe(true);
    expect(
      isWithinQuietHours({ nowLocalTime: "12:59", quietStart: "13:00", quietEnd: "14:00" }),
    ).toBe(false);
    expect(
      isWithinQuietHours({ nowLocalTime: "15:00", quietStart: "13:00", quietEnd: "14:00" }),
    ).toBe(false);
  });

  it("handles a window that crosses midnight", () => {
    // 22:00 tonight through 07:00 tomorrow.
    expect(
      isWithinQuietHours({ nowLocalTime: "23:00", quietStart: "22:00", quietEnd: "07:00" }),
    ).toBe(true);
    expect(
      isWithinQuietHours({ nowLocalTime: "03:00", quietStart: "22:00", quietEnd: "07:00" }),
    ).toBe(true);
    expect(
      isWithinQuietHours({ nowLocalTime: "12:00", quietStart: "22:00", quietEnd: "07:00" }),
    ).toBe(false);
  });

  it("accepts a full HH:MM:SS value the same way", () => {
    expect(
      isWithinQuietHours({ nowLocalTime: "23:00:00", quietStart: "22:00:00", quietEnd: "07:00:00" }),
    ).toBe(true);
  });
});
