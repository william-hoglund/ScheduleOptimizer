import { describe, expect, it } from "vitest";

import { parseIcs } from "@/lib/calendar/ics-parse";

/**
 * The ICS reader, against the shapes real feeds actually emit.
 *
 * The recurring theme: a timetable that shifts by an hour after the clocks
 * change is the failure mode that matters here, so DST is tested directly
 * rather than assumed.
 */

const STOCKHOLM = "Europe/Stockholm";

function ics(...lines: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...lines, "END:VCALENDAR"].join("\r\n");
}

function vevent(...lines: string[]): string[] {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
}

describe("parseIcs — a single event", () => {
  it("reads a zoned event at the offset in force on that date", () => {
    const { events } = parseIcs(
      ics(
        ...vevent(
          "UID:a@example.com",
          "SUMMARY:Databases lecture",
          "DTSTART;TZID=Europe/Stockholm:20260801T130000",
          "DTEND;TZID=Europe/Stockholm:20260801T150000",
          "LOCATION:SU00",
        ),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events).toHaveLength(1);
    // 13:00 Stockholm in August is 11:00Z, not 12:00Z.
    expect(events[0]?.startIso).toBe("2026-08-01T11:00:00.000Z");
    expect(events[0]?.endIso).toBe("2026-08-01T13:00:00.000Z");
    expect(events[0]?.location).toBe("SU00");
  });

  it("reads an absolute UTC time without touching it", () => {
    const { events } = parseIcs(
      ics(...vevent("UID:b", "SUMMARY:Standup", "DTSTART:20260801T090000Z", "DTEND:20260801T093000Z")),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events[0]?.startIso).toBe("2026-08-01T09:00:00.000Z");
  });

  it("treats a floating time as the student's own zone", () => {
    const { events } = parseIcs(
      ics(...vevent("UID:c", "SUMMARY:Reading", "DTSTART:20260801T130000", "DTEND:20260801T140000")),
      { fallbackTimeZone: "America/New_York" },
    );

    // 13:00 New York in August is 17:00Z.
    expect(events[0]?.startIso).toBe("2026-08-01T17:00:00.000Z");
  });

  it("covers a local day for an all-day event", () => {
    const { events } = parseIcs(
      ics(...vevent("UID:d", "SUMMARY:Exam period", "DTSTART;VALUE=DATE:20260801")),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events[0]?.isAllDay).toBe(true);
    expect(events[0]?.startIso).toBe("2026-07-31T22:00:00.000Z");
    expect(events[0]?.endIso).toBe("2026-08-01T22:00:00.000Z");
  });

  it("accepts DURATION when there is no DTEND", () => {
    const { events } = parseIcs(
      ics(...vevent("UID:e", "SUMMARY:Lab", "DTSTART:20260801T080000Z", "DURATION:PT1H30M")),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events[0]?.endIso).toBe("2026-08-01T09:30:00.000Z");
  });

  it("unfolds continuation lines", () => {
    const raw = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:f",
      "SUMMARY:Introduction to distributed systems and their practi",
      " cal applications",
      "DTSTART:20260801T080000Z",
      "DTEND:20260801T090000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const { events } = parseIcs(raw, { fallbackTimeZone: STOCKHOLM });
    expect(events[0]?.summary).toBe(
      "Introduction to distributed systems and their practical applications",
    );
  });

  it("unescapes commas, semicolons and newlines", () => {
    const { events } = parseIcs(
      ics(
        ...vevent(
          "UID:g",
          "SUMMARY:Kurs: TDDD86\\, Föreläsning",
          "DESCRIPTION:Line one\\nLine two\\; still two",
          "DTSTART:20260801T080000Z",
          "DTEND:20260801T090000Z",
        ),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events[0]?.summary).toBe("Kurs: TDDD86, Föreläsning");
    expect(events[0]?.description).toBe("Line one\nLine two; still two");
  });

  it("ignores a VTIMEZONE's own DTSTART", () => {
    const { events } = parseIcs(
      ics(
        "BEGIN:VTIMEZONE",
        "TZID:Europe/Stockholm",
        "BEGIN:DAYLIGHT",
        "DTSTART:19700329T020000",
        "TZOFFSETFROM:+0100",
        "TZOFFSETTO:+0200",
        "END:DAYLIGHT",
        "END:VTIMEZONE",
        ...vevent("UID:h", "SUMMARY:Real event", "DTSTART:20260801T080000Z", "DTEND:20260801T090000Z"),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe("Real event");
  });

  it("does not let a VALARM overwrite the event it sits inside", () => {
    // The case that actually exercises the component stack: a reminder carries
    // its own SUMMARY and DESCRIPTION, and a parser that ignores nesting will
    // happily rename the lecture to "Reminder".
    const { events } = parseIcs(
      ics(
        ...vevent(
          "UID:alarm-host",
          "SUMMARY:Databases lecture",
          "DESCRIPTION:Bring the exercise sheet",
          "DTSTART:20260801T080000Z",
          "DTEND:20260801T100000Z",
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          "TRIGGER:-PT15M",
          "SUMMARY:Reminder",
          "DESCRIPTION:Your lecture starts in 15 minutes",
          "END:VALARM",
        ),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe("Databases lecture");
    expect(events[0]?.description).toBe("Bring the exercise sheet");
  });

  it("skips cancelled and zero-length events", () => {
    const { events, warnings } = parseIcs(
      ics(
        ...vevent(
          "UID:i",
          "SUMMARY:Cancelled",
          "STATUS:CANCELLED",
          "DTSTART:20260801T080000Z",
          "DTEND:20260801T090000Z",
        ),
        ...vevent("UID:j", "SUMMARY:Zero", "DTSTART:20260801T080000Z", "DTEND:20260801T080000Z"),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events).toHaveLength(0);
    expect(warnings).toContainEqual({ code: "skippedInvalid", count: 1 });
  });

  it("falls back and warns on a timezone it does not know", () => {
    const { events, warnings } = parseIcs(
      ics(
        ...vevent(
          "UID:k",
          "SUMMARY:Outlook meeting",
          "DTSTART;TZID=W. Europe Standard Time:20260801T130000",
          "DTEND;TZID=W. Europe Standard Time:20260801T140000",
        ),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(warnings).toContainEqual({ code: "unknownTimezone", count: 1 });
    expect(events[0]?.startIso).toBe("2026-08-01T11:00:00.000Z");
  });

  it("recovers a namespaced TZID", () => {
    const { events, warnings } = parseIcs(
      ics(
        ...vevent(
          "UID:l",
          "SUMMARY:Zimbra event",
          "DTSTART;TZID=/freeassociation.sourceforge.net/Europe/Stockholm:20260801T130000",
          "DTEND;TZID=/freeassociation.sourceforge.net/Europe/Stockholm:20260801T140000",
        ),
      ),
      { fallbackTimeZone: "UTC" },
    );

    expect(warnings).not.toContainEqual(expect.objectContaining({ code: "unknownTimezone" }));
    expect(events[0]?.startIso).toBe("2026-08-01T11:00:00.000Z");
  });
});

describe("parseIcs — recurrence", () => {
  it("expands a weekly rule with a count", () => {
    const { events } = parseIcs(
      ics(
        ...vevent(
          "UID:r1",
          "SUMMARY:Weekly lecture",
          "DTSTART;TZID=Europe/Stockholm:20260803T100000",
          "DTEND;TZID=Europe/Stockholm:20260803T120000",
          "RRULE:FREQ=WEEKLY;COUNT=3",
        ),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events.map((e) => e.startIso)).toEqual([
      "2026-08-03T08:00:00.000Z",
      "2026-08-10T08:00:00.000Z",
      "2026-08-17T08:00:00.000Z",
    ]);
    expect(events[0]?.fromRecurrence).toBe(false);
    expect(events[1]?.fromRecurrence).toBe(true);
  });

  it("keeps the wall-clock hour across the autumn clock change", () => {
    // 25 October 2026 is when Stockholm leaves summer time. A weekly 10:00
    // lecture must stay at 10:00 — which means the UTC instant has to move.
    const { events } = parseIcs(
      ics(
        ...vevent(
          "UID:r2",
          "SUMMARY:Autumn lecture",
          "DTSTART;TZID=Europe/Stockholm:20261019T100000",
          "DTEND;TZID=Europe/Stockholm:20261019T120000",
          "RRULE:FREQ=WEEKLY;COUNT=2",
        ),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events[0]?.startIso).toBe("2026-10-19T08:00:00.000Z");
    expect(events[1]?.startIso).toBe("2026-10-26T09:00:00.000Z");
  });

  it("honours BYDAY and INTERVAL", () => {
    const { events } = parseIcs(
      ics(
        ...vevent(
          "UID:r3",
          "SUMMARY:Twice a fortnight",
          "DTSTART:20260803T080000Z",
          "DTEND:20260803T090000Z",
          "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4",
        ),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events.map((e) => e.startIso.slice(0, 10))).toEqual([
      "2026-08-03",
      "2026-08-05",
      "2026-08-17",
      "2026-08-19",
    ]);
  });

  it("stops at UNTIL", () => {
    const { events } = parseIcs(
      ics(
        ...vevent(
          "UID:r4",
          "SUMMARY:Until",
          "DTSTART:20260803T080000Z",
          "DTEND:20260803T090000Z",
          "RRULE:FREQ=DAILY;UNTIL=20260805T235900Z",
        ),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events).toHaveLength(3);
  });

  it("removes an EXDATE occurrence", () => {
    const { events } = parseIcs(
      ics(
        ...vevent(
          "UID:r5",
          "SUMMARY:With a gap",
          "DTSTART:20260803T080000Z",
          "DTEND:20260803T090000Z",
          "RRULE:FREQ=DAILY;COUNT=3",
          "EXDATE:20260804T080000Z",
        ),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events.map((e) => e.startIso.slice(0, 10))).toEqual(["2026-08-03", "2026-08-05"]);
  });

  it("does not double-book an occurrence the feed overrides", () => {
    const { events } = parseIcs(
      ics(
        ...vevent(
          "UID:r6",
          "SUMMARY:Series",
          "DTSTART:20260803T080000Z",
          "DTEND:20260803T090000Z",
          "RRULE:FREQ=DAILY;COUNT=3",
        ),
        ...vevent(
          "UID:r6",
          "RECURRENCE-ID:20260804T080000Z",
          "SUMMARY:Moved to the afternoon",
          "DTSTART:20260804T130000Z",
          "DTEND:20260804T140000Z",
        ),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.summary)).toEqual(["Series", "Moved to the afternoon", "Series"]);
  });

  it("keeps one occurrence and warns when the rule is too clever", () => {
    const { events, warnings } = parseIcs(
      ics(
        ...vevent(
          "UID:r7",
          "SUMMARY:Third Friday",
          "DTSTART:20260821T080000Z",
          "DTEND:20260821T090000Z",
          "RRULE:FREQ=MONTHLY;BYDAY=3FR",
        ),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    expect(events).toHaveLength(1);
    expect(warnings).toContainEqual({ code: "unsupportedRecurrence", count: 1 });
  });

  it("stops at maxEvents rather than importing thousands", () => {
    const { events, warnings } = parseIcs(
      ics(
        ...vevent(
          "UID:r8",
          "SUMMARY:Daily",
          "DTSTART:20260803T080000Z",
          "DTEND:20260803T090000Z",
          "RRULE:FREQ=DAILY;COUNT=100",
        ),
      ),
      { fallbackTimeZone: STOCKHOLM, maxEvents: 10 },
    );

    expect(events).toHaveLength(10);
    expect(warnings).toContainEqual(expect.objectContaining({ code: "truncated" }));
  });

  it("skips a monthly date that does not exist in every month", () => {
    const { events } = parseIcs(
      ics(
        ...vevent(
          "UID:r9",
          "SUMMARY:End of month",
          "DTSTART:20260131T080000Z",
          "DTEND:20260131T090000Z",
          "RRULE:FREQ=MONTHLY;COUNT=3",
        ),
      ),
      { fallbackTimeZone: STOCKHOLM },
    );

    // No 31 February — the series continues in March.
    expect(events.map((e) => e.startIso.slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
    ]);
  });
});
