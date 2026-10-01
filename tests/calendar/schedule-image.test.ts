import { describe, expect, it } from "vitest";

import { toImportCandidates } from "@/lib/calendar/schedule-image";
import type { ExtractedScheduleEntry } from "@/lib/ai";

/**
 * Turning a timetable photo's weekly pattern into real calendar instants —
 * the one genuinely new expansion job in the schedule-image import (see the
 * file's own header comment for why it shares no code with `.ics`
 * recurrence).
 */

const STOCKHOLM = "Europe/Stockholm";

function entry(overrides: Partial<ExtractedScheduleEntry> = {}): ExtractedScheduleEntry {
  return {
    title: "Databases lecture",
    dayOfWeek: null,
    date: null,
    startTime: "10:00",
    endTime: "12:00",
    location: null,
    courseCode: null,
    eventType: "lecture",
    confidence: "high",
    ...overrides,
  };
}

describe("toImportCandidates — a weekly dayOfWeek pattern", () => {
  it("produces one candidate per matching weekday in range", () => {
    // 2026-08-03 is a Monday.
    const candidates = toImportCandidates(
      [entry({ dayOfWeek: 1 })],
      { startDate: "2026-08-03", endDate: "2026-08-24" },
      STOCKHOLM,
    );

    // Mondays in range: Aug 3, 10, 17, 24.
    expect(candidates).toHaveLength(4);
    expect(candidates.map((c) => c.startIso.slice(0, 10))).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
    ]);
  });

  it("starts from the first matching weekday, not the range start itself", () => {
    // 2026-08-03 is a Monday; asking for Wednesday (3) should skip to Aug 5.
    const candidates = toImportCandidates(
      [entry({ dayOfWeek: 3 })],
      { startDate: "2026-08-03", endDate: "2026-08-05" },
      STOCKHOLM,
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.startIso.slice(0, 10)).toBe("2026-08-05");
  });

  it("produces nothing when the weekday never falls inside a short range", () => {
    // Aug 3-4 2026 is Mon-Tue only; no Friday (5) in it.
    const candidates = toImportCandidates(
      [entry({ dayOfWeek: 5 })],
      { startDate: "2026-08-03", endDate: "2026-08-04" },
      STOCKHOLM,
    );
    expect(candidates).toHaveLength(0);
  });

  it("produces nothing when the range is backwards", () => {
    const candidates = toImportCandidates(
      [entry({ dayOfWeek: 1 })],
      { startDate: "2026-08-24", endDate: "2026-08-03" },
      STOCKHOLM,
    );
    expect(candidates).toHaveLength(0);
  });

  it("converts the wall-clock time through the given zone", () => {
    const candidates = toImportCandidates(
      [entry({ dayOfWeek: 1, startTime: "10:00", endTime: "12:00" })],
      { startDate: "2026-08-03", endDate: "2026-08-03" },
      STOCKHOLM,
    );

    // Stockholm is UTC+2 in August (CEST).
    expect(candidates[0]?.startIso).toBe("2026-08-03T08:00:00.000Z");
    expect(candidates[0]?.endIso).toBe("2026-08-03T10:00:00.000Z");
    expect(candidates[0]?.isAllDay).toBe(false);
  });

  it("gives each occurrence a distinct, stable external id", () => {
    const candidates = toImportCandidates(
      [entry({ dayOfWeek: 1 })],
      { startDate: "2026-08-03", endDate: "2026-08-10" },
      STOCKHOLM,
    );
    const ids = candidates.map((c) => c.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("toImportCandidates — a specific date entry", () => {
  it("uses its own date once, ignoring the picked range entirely", () => {
    const candidates = toImportCandidates(
      [entry({ date: "2026-09-15", dayOfWeek: null })],
      { startDate: "2026-08-03", endDate: "2026-08-10" },
      STOCKHOLM,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.startIso.slice(0, 10)).toBe("2026-09-15");
  });
});

describe("toImportCandidates — entries with no usable time", () => {
  it("falls back to all-day rather than dropping the entry", () => {
    const candidates = toImportCandidates(
      [entry({ dayOfWeek: 1, startTime: null, endTime: null })],
      { startDate: "2026-08-03", endDate: "2026-08-03" },
      STOCKHOLM,
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.isAllDay).toBe(true);
    expect(candidates[0]?.startIso).toBe("2026-08-02T22:00:00.000Z");
    expect(candidates[0]?.endIso).toBe("2026-08-03T22:00:00.000Z");
  });
});

describe("toImportCandidates — malformed entries", () => {
  it("drops an occurrence whose end is not after its start", () => {
    const candidates = toImportCandidates(
      [entry({ dayOfWeek: 1, startTime: "12:00", endTime: "10:00" })],
      { startDate: "2026-08-03", endDate: "2026-08-03" },
      STOCKHOLM,
    );
    expect(candidates).toHaveLength(0);
  });

  it("drops an entry with neither a date nor a dayOfWeek", () => {
    const candidates = toImportCandidates(
      [entry({ date: null, dayOfWeek: null })],
      { startDate: "2026-08-03", endDate: "2026-08-10" },
      STOCKHOLM,
    );
    expect(candidates).toHaveLength(0);
  });
});

describe("toImportCandidates — several entries together", () => {
  it("expands each independently and keeps their own fields", () => {
    const candidates = toImportCandidates(
      [
        entry({ title: "Databases", dayOfWeek: 1, courseCode: "TDDD37" }),
        entry({ title: "Algorithms", dayOfWeek: 3, courseCode: "TDDD86", location: "B12" }),
      ],
      { startDate: "2026-08-03", endDate: "2026-08-10" },
      STOCKHOLM,
    );

    // Monday x2 (3, 10) + Wednesday x1 (5) in that window.
    expect(candidates).toHaveLength(3);
    expect(candidates.filter((c) => c.title === "Databases")).toHaveLength(2);
    const algorithms = candidates.find((c) => c.title === "Algorithms");
    expect(algorithms?.courseCode).toBe("TDDD86");
    expect(algorithms?.location).toBe("B12");
  });
});
