import { describe, expect, it } from "vitest";

import { toImportCandidate, toImportCandidates, type GoogleEvent } from "@/lib/calendar/google-event";

/**
 * Mapping a Google Calendar API event into the same `ImportCandidate` shape
 * an `.ics` VEVENT produces. Everything downstream of this (duplicate
 * detection, course matching, the review screen) is already tested against
 * that shape — the risk here is entirely in getting the mapping right.
 */

const STOCKHOLM = "Europe/Stockholm";

function timedEvent(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: "abc123",
    status: "confirmed",
    summary: "Databases lecture",
    start: { dateTime: "2026-08-01T13:00:00+02:00" },
    end: { dateTime: "2026-08-01T15:00:00+02:00" },
    ...overrides,
  };
}

describe("toImportCandidate — timed events", () => {
  it("carries the event id as the external id", () => {
    const candidate = toImportCandidate(timedEvent(), STOCKHOLM);
    expect(candidate?.externalId).toBe("abc123");
  });

  it("uses dateTime directly, not re-converted through the profile zone", () => {
    const candidate = toImportCandidate(timedEvent(), STOCKHOLM);
    expect(candidate?.startIso).toBe("2026-08-01T13:00:00+02:00");
    expect(candidate?.endIso).toBe("2026-08-01T15:00:00+02:00");
    expect(candidate?.isAllDay).toBe(false);
  });

  it("classifies the event type and extracts a course code from the title", () => {
    const candidate = toImportCandidate(
      timedEvent({ summary: "MSG830 Databases - Lecture" }),
      STOCKHOLM,
    );
    expect(candidate?.eventType).toBe("lecture");
    expect(candidate?.courseCode).toBe("MSG830");
  });

  it("falls back to 'Untitled event' when summary is missing", () => {
    const candidate = toImportCandidate(timedEvent({ summary: undefined }), STOCKHOLM);
    expect(candidate?.title).toBe("Untitled event");
  });

  it("carries location and description through", () => {
    const candidate = toImportCandidate(
      timedEvent({ location: "Room B12", description: "Bring a laptop" }),
      STOCKHOLM,
    );
    expect(candidate?.location).toBe("Room B12");
    expect(candidate?.description).toBe("Bring a laptop");
  });
});

describe("toImportCandidate — all-day events", () => {
  it("converts a date-only start/end through the profile time zone", () => {
    const candidate = toImportCandidate(
      timedEvent({
        start: { date: "2026-08-01" },
        end: { date: "2026-08-02" },
      }),
      STOCKHOLM,
    );

    expect(candidate?.isAllDay).toBe(true);
    // Midnight Europe/Stockholm on 2026-08-01 is 22:00 UTC on 2026-07-31 (CEST, UTC+2).
    expect(candidate?.startIso).toBe("2026-07-31T22:00:00.000Z");
    expect(candidate?.endIso).toBe("2026-08-01T22:00:00.000Z");
  });
});

describe("toImportCandidate — events this product has no use for", () => {
  it("skips a cancelled instance rather than importing a tombstone", () => {
    expect(toImportCandidate(timedEvent({ status: "cancelled" }), STOCKHOLM)).toBeNull();
  });

  it("skips an event with neither a date nor a dateTime on start", () => {
    expect(
      toImportCandidate(timedEvent({ start: {}, end: { dateTime: "2026-08-01T15:00:00+02:00" } }), STOCKHOLM),
    ).toBeNull();
  });

  it("skips an event with neither a date nor a dateTime on end", () => {
    expect(
      toImportCandidate(timedEvent({ start: { dateTime: "2026-08-01T13:00:00+02:00" }, end: {} }), STOCKHOLM),
    ).toBeNull();
  });
});

describe("toImportCandidates", () => {
  it("drops skipped events rather than producing a hole in the array", () => {
    const events = [
      timedEvent({ id: "keep-1" }),
      timedEvent({ id: "cancelled", status: "cancelled" }),
      timedEvent({ id: "keep-2" }),
    ];

    const candidates = toImportCandidates(events, STOCKHOLM);
    expect(candidates.map((c) => c.externalId)).toEqual(["keep-1", "keep-2"]);
  });
});
