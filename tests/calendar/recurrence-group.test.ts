import { describe, expect, it } from "vitest";

import { recurrenceGroupKey } from "@/lib/calendar/recurrence-group";

describe("recurrenceGroupKey", () => {
  it("groups .ics recurrence occurrences by their shared uid", () => {
    const a = recurrenceGroupKey("abc123@moodle.example::2026-08-03T08:00:00.000Z");
    const b = recurrenceGroupKey("abc123@moodle.example::2026-08-10T08:00:00.000Z");
    expect(a).toBe("abc123@moodle.example");
    expect(a).toBe(b);
  });

  it("groups schedule-image weekly-pattern occurrences by their entry index", () => {
    const a = recurrenceGroupKey("schedule-image:0:2026-08-03");
    const b = recurrenceGroupKey("schedule-image:0:2026-08-10");
    const other = recurrenceGroupKey("schedule-image:1:2026-08-04");
    expect(a).toBe("schedule-image:0");
    expect(a).toBe(b);
    expect(other).not.toBe(a);
  });

  it("returns null for a standalone, non-recurring id", () => {
    expect(recurrenceGroupKey("abc123@moodle.example")).toBeNull();
    expect(recurrenceGroupKey("derived-19xk3p")).toBeNull();
  });
});
