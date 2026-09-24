/**
 * Writing iCalendar (RFC 5545) text.
 *
 * Pure: events in, a string out, with `now` passed as an argument like
 * everywhere else. The output is what the student's own calendar app has to
 * accept, so the fiddly parts of the spec — escaping, 75-octet line folding,
 * CRLF endings — are all handled here rather than trusted to happen.
 */

export type IcsExportEvent = {
  /** Stable per row, so re-importing an export updates instead of duplicating. */
  uid: string;
  title: string;
  startIso: string;
  endIso: string;
  description?: string | null;
  location?: string | null;
  categories?: readonly string[];
};

export type BuildIcsOptions = {
  calendarName: string;
  /** Stamped on every event; passed in so the output is reproducible in tests. */
  nowIso: string;
  timeZone?: string;
};

const PRODUCT_ID = "-//AI Study Planner//EN";

/** Order matters: backslashes must be escaped before anything that adds one. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** "2026-08-01T13:00:00.000Z" → "20260801T130000Z". */
function toIcsInstant(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Fold a content line to 75 octets.
 *
 * Counted in **bytes**, not characters: "Föreläsning" is longer on the wire
 * than it looks, and folding by character length produces lines that some
 * calendar apps reject.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, which costs one of the 75.
    const limit = out.length === 0 ? 75 : 74;

    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }

    current += char;
    bytes += size;
  }

  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(
  events: readonly IcsExportEvent[],
  options: BuildIcsOptions,
): string {
  const stamp = toIcsInstant(options.nowIso);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODUCT_ID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.calendarName)}`,
  ];

  if (options.timeZone) {
    lines.push(`X-WR-TIMEZONE:${escapeText(options.timeZone)}`);
  }

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsInstant(event.startIso)}`,
      `DTEND:${toIcsInstant(event.endIso)}`,
      `SUMMARY:${escapeText(event.title)}`,
    );

    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.categories && event.categories.length > 0) {
      lines.push(`CATEGORIES:${event.categories.map(escapeText).join(",")}`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // RFC 5545 requires CRLF, including after the last line.
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
