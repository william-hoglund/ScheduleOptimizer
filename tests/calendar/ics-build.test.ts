import { describe, expect, it } from "vitest";

import { buildIcs } from "@/lib/calendar/ics-build";
import { parseIcs } from "@/lib/calendar/ics-parse";

const NOW = "2026-08-01T09:00:00.000Z";

describe("buildIcs", () => {
  it("writes a well-formed calendar with CRLF endings", () => {
    const output = buildIcs(
      [
        {
          uid: "session-1@studyplanner",
          title: "Statistics",
          startIso: "2026-08-03T08:00:00.000Z",
          endIso: "2026-08-03T09:30:00.000Z",
        },
      ],
      { calendarName: "My study plan", nowIso: NOW },
    );

    expect(output.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(output.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(output).toContain("DTSTART:20260803T080000Z");
    expect(output).toContain("DTEND:20260803T093000Z");
    expect(output).toContain("DTSTAMP:20260801T090000Z");
    expect(output).not.toContain("\n\n");
  });

  it("escapes the characters that would otherwise break a field", () => {
    const output = buildIcs(
      [
        {
          uid: "x",
          title: "Kurs: TDDD86, Föreläsning; sal A",
          startIso: "2026-08-03T08:00:00.000Z",
          endIso: "2026-08-03T09:00:00.000Z",
          description: "Line one\nLine two",
        },
      ],
      { calendarName: "Plan", nowIso: NOW },
    );

    expect(output).toContain("SUMMARY:Kurs: TDDD86\\, Föreläsning\\; sal A");
    expect(output).toContain("DESCRIPTION:Line one\\nLine two");
  });

  it("folds long lines at 75 octets, counting bytes not characters", () => {
    const output = buildIcs(
      [
        {
          uid: "y",
          // Every "ö" is two bytes, so a character-based fold would produce
          // lines that are legal-looking but too long on the wire.
          title: "Föreläsning ".repeat(12),
          startIso: "2026-08-03T08:00:00.000Z",
          endIso: "2026-08-03T09:00:00.000Z",
        },
      ],
      { calendarName: "Plan", nowIso: NOW },
    );

    const encoder = new TextEncoder();
    for (const line of output.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("survives a round trip through the parser", () => {
    const output = buildIcs(
      [
        {
          uid: "round-trip",
          title: "Databaser – TDDD37",
          startIso: "2026-08-03T08:00:00.000Z",
          endIso: "2026-08-03T10:00:00.000Z",
          location: "SU00, hus B",
        },
      ],
      { calendarName: "Plan", nowIso: NOW },
    );

    const { events, calendarName } = parseIcs(output, { fallbackTimeZone: "Europe/Stockholm" });

    expect(calendarName).toBe("Plan");
    expect(events).toHaveLength(1);
    expect(events[0]?.uid).toBe("round-trip");
    expect(events[0]?.summary).toBe("Databaser – TDDD37");
    expect(events[0]?.location).toBe("SU00, hus B");
    expect(events[0]?.startIso).toBe("2026-08-03T08:00:00.000Z");
    expect(events[0]?.endIso).toBe("2026-08-03T10:00:00.000Z");
  });
});
