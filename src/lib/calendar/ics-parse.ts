import { wallClockToUtc } from "./time";

/**
 * An iCalendar (RFC 5545) reader.
 *
 * Pure: text in, plain objects out. No fetching, no database, no clock. That is
 * what makes it testable, and every awkward real-world feed can be pinned as a
 * fixture in `tests/calendar/ics-parse.test.ts`.
 *
 * Written by hand rather than pulled from npm on purpose. The parsers on npm
 * either expand recurrence with their own timezone handling — the single
 * highest-risk area in this product (§2.4) — or drag in a Node-only dependency
 * tree. Here, every wall-clock conversion goes through `lib/calendar/time.ts`
 * like everywhere else in the app.
 *
 * What it deliberately does NOT do:
 *  - VTIMEZONE definitions are skipped. TZID is read as an IANA zone name,
 *    which is what every feed we care about emits. An unrecognised zone falls
 *    back to the student's own and says so.
 *  - Only DAILY / WEEKLY / MONTHLY / YEARLY recurrence with INTERVAL, COUNT,
 *    UNTIL and BYDAY is expanded. Anything more exotic keeps its first
 *    occurrence and raises a warning, so nothing silently disappears.
 */

export type IcsWarningCode =
  | "unknownTimezone"
  | "unsupportedRecurrence"
  | "recurrenceCapped"
  | "skippedInvalid"
  | "truncated";

export type IcsWarning = { code: IcsWarningCode; count: number };

export type ParsedIcsEvent = {
  /** The feed's own UID. Null when the feed omitted it. */
  uid: string | null;
  summary: string;
  description: string | null;
  location: string | null;
  startIso: string;
  endIso: string;
  isAllDay: boolean;
  /** True when this came out of a recurrence rule rather than its own VEVENT. */
  fromRecurrence: boolean;
};

export type ParsedIcs = {
  calendarName: string | null;
  events: ParsedIcsEvent[];
  warnings: IcsWarning[];
};

export type ParseIcsOptions = {
  /** Used for floating times, all-day events, and unrecognised TZIDs. */
  fallbackTimeZone: string;
  /** Hard ceiling on how many events one import may produce. */
  maxEvents?: number;
};

/** One rule may not produce more than this many occurrences. */
const MAX_OCCURRENCES_PER_RULE = 400;

/** Nor stretch further than this beyond its first occurrence. */
const MAX_HORIZON_DAYS = 730;

const DEFAULT_MAX_EVENTS = 2000;

// ------------------------------------------------------------------ lexing ---

type ContentLine = { name: string; params: Record<string, string>; value: string };

/**
 * Undo RFC 5545 line folding.
 *
 * A long property is split across lines, each continuation starting with a
 * space or tab. Miss this and a URL or a long title arrives cut in half.
 */
function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];

  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }

  return out;
}

/**
 * "DTSTART;TZID=Europe/Stockholm:20260801T130000" → name, params, value.
 *
 * The colon that ends the property name may appear inside a quoted parameter
 * ("TZID="Europe/Stockholm"") so the split has to respect quoting.
 */
function parseContentLine(line: string): ContentLine | null {
  let inQuotes = false;
  let colon = -1;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }

  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [rawName, ...rawParams] = head.split(";");
  if (!rawName) return null;

  const params: Record<string, string> = {};
  for (const part of rawParams) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).toUpperCase();
    params[key] = part.slice(eq + 1).replace(/^"|"$/g, "");
  }

  return { name: rawName.toUpperCase(), params, value };
}

/** TEXT values escape commas, semicolons, backslashes and newlines. */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

// ------------------------------------------------------------------- time ----

type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

type IcsDate = { wall: WallClock; zone: string; dateOnly: boolean };

const pad = (n: number) => String(n).padStart(2, "0");

function formatWall(wall: WallClock): string {
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}

function toInstant(date: IcsDate): string | null {
  return wallClockToUtc(formatWall(date.wall), date.zone);
}

function isKnownTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * A TZID as written in the file → a zone `Intl` understands.
 *
 * Some exporters prefix the zone with their own namespace
 * ("/freeassociation.sourceforge.net/Europe/Stockholm"), and Outlook writes
 * Windows names ("W. Europe Standard Time") that no IANA database contains.
 * The first is recoverable; the second is not, and says so.
 */
function resolveZone(tzid: string | undefined, fallback: string): { zone: string; known: boolean } {
  if (!tzid) return { zone: fallback, known: true };
  if (isKnownTimeZone(tzid)) return { zone: tzid, known: true };

  const segments = tzid.split("/").filter(Boolean);
  if (segments.length >= 2) {
    const tail = segments.slice(-2).join("/");
    if (isKnownTimeZone(tail)) return { zone: tail, known: true };
  }

  return { zone: fallback, known: false };
}

/**
 * A DATE or DATE-TIME property value.
 *
 * Three forms exist and they mean different things: "20260801" is a whole day,
 * "20260801T130000Z" is an absolute instant, and "20260801T130000" is
 * wall-clock — either in the TZID given, or "floating", meaning whatever zone
 * the reader is in. Floating becomes the student's own zone.
 */
function parseIcsDate(
  value: string,
  params: Record<string, string>,
  fallbackZone: string,
): { date: IcsDate; unknownZone: boolean } | null {
  const trimmed = value.trim();
  const dateOnly = /^\d{8}$/.test(trimmed) || params.VALUE === "DATE";

  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(trimmed);
  if (!match) return null;

  const [, year, month, day, hour, minute, , utcFlag] = match;

  const wall: WallClock = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: dateOnly ? 0 : Number(hour ?? 0),
    minute: dateOnly ? 0 : Number(minute ?? 0),
  };

  if (wall.month < 1 || wall.month > 12 || wall.day < 1 || wall.day > 31) return null;

  if (utcFlag === "Z") {
    return { date: { wall, zone: "UTC", dateOnly: false }, unknownZone: false };
  }

  // An all-day event has no zone of its own: "the 1st of August" is whichever
  // 24 hours that is where the student lives.
  const resolved = dateOnly
    ? { zone: fallbackZone, known: true }
    : resolveZone(params.TZID, fallbackZone);

  return { date: { wall, zone: resolved.zone, dateOnly }, unknownZone: !resolved.known };
}

/** "PT1H30M", "P1D" — the subset that appears on real events. */
function parseDurationMinutes(value: string): number | null {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    value.trim().toUpperCase(),
  );
  if (!match) return null;

  const [, sign, weeks, days, hours, minutes, seconds] = match;
  const total =
    Number(weeks ?? 0) * 7 * 24 * 60 +
    Number(days ?? 0) * 24 * 60 +
    Number(hours ?? 0) * 60 +
    Number(minutes ?? 0) +
    Math.round(Number(seconds ?? 0) / 60);

  if (total === 0) return null;
  return sign === "-" ? -total : total;
}

// -------------------------------------------------------------- recurrence ---

type Recurrence = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count: number | null;
  untilMs: number | null;
  /** ISO weekday numbers, 1 = Monday … 7 = Sunday. */
  byDay: number[];
};

const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** Returns null when the rule uses something this parser will not pretend to support. */
function parseRecurrence(value: string): Recurrence | null {
  const parts = new Map<string, string>();
  for (const chunk of value.split(";")) {
    const eq = chunk.indexOf("=");
    if (eq === -1) continue;
    parts.set(chunk.slice(0, eq).trim().toUpperCase(), chunk.slice(eq + 1).trim());
  }

  const freq = parts.get("FREQ")?.toUpperCase();
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    return null;
  }

  // Anything that reshapes the pattern rather than merely repeating it. Guessing
  // at these produces sessions on days the student does not have a lecture,
  // which is worse than importing one occurrence and saying so.
  for (const unsupported of ["BYSETPOS", "BYMONTHDAY", "BYYEARDAY", "BYWEEKNO", "BYMONTH"]) {
    if (parts.has(unsupported)) return null;
  }

  const byDay: number[] = [];
  const rawByDay = parts.get("BYDAY");
  if (rawByDay) {
    for (const token of rawByDay.split(",")) {
      const code = token.trim().toUpperCase().slice(-2);
      const index = WEEKDAY_CODES.indexOf(code);
      // A numbered weekday ("2FR" = the second Friday) is a reshaping rule.
      if (index === -1 || /\d/.test(token)) return null;
      byDay.push(index + 1);
    }
  }

  const interval = Number(parts.get("INTERVAL") ?? 1);
  const count = parts.has("COUNT") ? Number(parts.get("COUNT")) : null;

  let untilMs: number | null = null;
  const until = parts.get("UNTIL");
  if (until) {
    const parsed = parseIcsDate(until, {}, "UTC");
    const instant = parsed ? toInstant(parsed.date) : null;
    if (instant) untilMs = Date.parse(instant);
  }

  if (!Number.isFinite(interval) || interval < 1) return null;
  if (count !== null && (!Number.isFinite(count) || count < 1)) return null;

  return { freq, interval, count, untilMs, byDay: byDay.sort((a, b) => a - b) };
}

/** Calendar arithmetic on a wall-clock date. UTC is used purely as a scratch pad. */
function shiftWall(wall: WallClock, { days = 0, months = 0, years = 0 }): WallClock | null {
  const base = Date.UTC(wall.year, wall.month - 1 + months, wall.day + days);
  const shifted = new Date(base);
  shifted.setUTCFullYear(shifted.getUTCFullYear() + years);

  const result = {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: wall.hour,
    minute: wall.minute,
  };

  // 31 January + 1 month lands on 2 or 3 March. RFC 5545 says such an
  // occurrence simply does not happen, so it is dropped rather than moved.
  if ((months !== 0 || years !== 0) && result.day !== wall.day) return null;

  return result;
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
function isoWeekday(wall: WallClock): number {
  const day = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * The wall-clock start of every occurrence of a rule.
 *
 * Expansion happens on wall-clock values, never by adding 24 or 168 hours to an
 * instant. A weekly 13:00 lecture must stay at 13:00 through the March and
 * October clock changes — the whole reason §2.4 exists.
 */
function expandRecurrence(
  start: WallClock,
  rule: Recurrence,
  zone: string,
): { starts: WallClock[]; capped: boolean } {
  const starts: WallClock[] = [];
  const horizonMs = Date.parse(`${formatWall(start)}:00Z`) + MAX_HORIZON_DAYS * 86_400_000;
  let capped = false;

  const accept = (wall: WallClock): boolean => {
    const instant = wallClockToUtc(formatWall(wall), zone);
    if (!instant) return true;

    const ms = Date.parse(instant);
    if (rule.untilMs !== null && ms > rule.untilMs) return false;
    if (Date.parse(`${formatWall(wall)}:00Z`) > horizonMs) return false;

    starts.push(wall);
    return true;
  };

  const done = () => {
    if (rule.count !== null && starts.length >= rule.count) return true;
    if (starts.length >= MAX_OCCURRENCES_PER_RULE) {
      capped = true;
      return true;
    }
    return false;
  };

  if (rule.freq === "WEEKLY" && rule.byDay.length > 0) {
    // Walk week by week from the Monday of the first occurrence's week, so an
    // INTERVAL of 2 skips whole weeks rather than individual days.
    const mondayOffset = 1 - isoWeekday(start);
    let weekStart = shiftWall(start, { days: mondayOffset });

    while (weekStart && !done()) {
      for (const weekday of rule.byDay) {
        const candidate = shiftWall(weekStart, { days: weekday - 1 });
        if (!candidate) continue;
        // Occurrences before DTSTART are not part of the series.
        if (formatWall(candidate) < formatWall(start)) continue;
        if (done()) break;
        if (!accept(candidate)) return { starts, capped };
      }
      weekStart = shiftWall(weekStart, { days: 7 * rule.interval });
    }

    return { starts, capped };
  }

  const step =
    rule.freq === "DAILY"
      ? { days: rule.interval }
      : rule.freq === "WEEKLY"
        ? { days: 7 * rule.interval }
        : rule.freq === "MONTHLY"
          ? { months: rule.interval }
          : { years: rule.interval };

  let cursor: WallClock | null = start;
  let iterations = 0;

  while (cursor && !done() && iterations < MAX_OCCURRENCES_PER_RULE * 2) {
    if (!accept(cursor)) break;
    iterations += 1;

    // A skipped month (the 31st of a 30-day month) must not stop the series.
    let next = shiftWall(cursor, step);
    let attempts = 0;
    while (!next && attempts < 12) {
      attempts += 1;
      const skip =
        rule.freq === "MONTHLY"
          ? { months: rule.interval * (attempts + 1) }
          : { years: rule.interval * (attempts + 1) };
      next = shiftWall(cursor, skip);
    }
    cursor = next;
  }

  return { starts, capped };
}

// ------------------------------------------------------------------ events ---

type RawEvent = {
  uid: string | null;
  summary: string;
  description: string | null;
  location: string | null;
  start: IcsDate | null;
  end: IcsDate | null;
  durationMinutes: number | null;
  rrule: string | null;
  exDates: string[];
  recurrenceId: string | null;
  cancelled: boolean;
  unknownZone: boolean;
};

function emptyRawEvent(): RawEvent {
  return {
    uid: null,
    summary: "",
    description: null,
    location: null,
    start: null,
    end: null,
    durationMinutes: null,
    rrule: null,
    exDates: [],
    recurrenceId: null,
    cancelled: false,
    unknownZone: false,
  };
}

class WarningTally {
  private readonly counts = new Map<IcsWarningCode, number>();

  add(code: IcsWarningCode, amount = 1): void {
    this.counts.set(code, (this.counts.get(code) ?? 0) + amount);
  }

  list(): IcsWarning[] {
    return [...this.counts.entries()].map(([code, count]) => ({ code, count }));
  }
}

export function parseIcs(text: string, options: ParseIcsOptions): ParsedIcs {
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  const warnings = new WarningTally();

  const raw: RawEvent[] = [];
  let calendarName: string | null = null;

  // A stack, because VEVENTs contain VALARMs and a calendar contains VTIMEZONEs.
  // Reading a VTIMEZONE's own DTSTART as an event is a classic parser bug.
  const stack: string[] = [];
  let current: RawEvent | null = null;

  for (const line of unfold(text)) {
    if (line.trim() === "") continue;

    const parsed = parseContentLine(line);
    if (!parsed) continue;

    if (parsed.name === "BEGIN") {
      stack.push(parsed.value.toUpperCase());
      if (parsed.value.toUpperCase() === "VEVENT") current = emptyRawEvent();
      continue;
    }

    if (parsed.name === "END") {
      const ended = stack.pop();
      if (ended === "VEVENT" && current) {
        raw.push(current);
        current = null;
      }
      continue;
    }

    const inside = stack[stack.length - 1];

    if (inside === "VCALENDAR" && parsed.name === "X-WR-CALNAME") {
      calendarName = unescapeText(parsed.value) || null;
      continue;
    }

    if (inside !== "VEVENT" || !current) continue;

    switch (parsed.name) {
      case "UID":
        current.uid = parsed.value.trim() || null;
        break;
      case "SUMMARY":
        current.summary = unescapeText(parsed.value);
        break;
      case "DESCRIPTION":
        current.description = unescapeText(parsed.value) || null;
        break;
      case "LOCATION":
        current.location = unescapeText(parsed.value) || null;
        break;
      case "STATUS":
        current.cancelled = parsed.value.trim().toUpperCase() === "CANCELLED";
        break;
      case "RRULE":
        current.rrule = parsed.value.trim();
        break;
      case "RECURRENCE-ID": {
        const result = parseIcsDate(parsed.value, parsed.params, options.fallbackTimeZone);
        current.recurrenceId = result ? toInstant(result.date) : null;
        break;
      }
      case "EXDATE": {
        for (const piece of parsed.value.split(",")) {
          const result = parseIcsDate(piece, parsed.params, options.fallbackTimeZone);
          const instant = result ? toInstant(result.date) : null;
          if (instant) current.exDates.push(instant);
        }
        break;
      }
      case "DURATION":
        current.durationMinutes = parseDurationMinutes(parsed.value);
        break;
      case "DTSTART":
      case "DTEND": {
        const result = parseIcsDate(parsed.value, parsed.params, options.fallbackTimeZone);
        if (!result) break;
        if (result.unknownZone) current.unknownZone = true;
        if (parsed.name === "DTSTART") current.start = result.date;
        else current.end = result.date;
        break;
      }
      default:
        break;
    }
  }

  // Occurrences the feed has overridden individually. Their replacement VEVENT
  // carries the details, so expanding the parent over the same instant would
  // put the event on the calendar twice.
  const overridden = new Set<string>();
  for (const event of raw) {
    if (event.uid && event.recurrenceId) overridden.add(`${event.uid}|${event.recurrenceId}`);
  }

  const events: ParsedIcsEvent[] = [];
  let skipped = 0;
  let truncated = 0;
  let unknownZones = 0;

  for (const event of raw) {
    if (event.cancelled) continue;

    const startDate = event.start;
    if (!startDate) {
      skipped += 1;
      continue;
    }
    if (event.unknownZone) unknownZones += 1;

    const startIso = toInstant(startDate);
    if (!startIso) {
      skipped += 1;
      continue;
    }

    // Duration, an explicit end, or the RFC default: a whole day for a DATE, an
    // hour for anything else so the event is at least visible and editable.
    //
    // DTEND equal to DTSTART is not malformed — it is how Moodle (and other
    // LMS feeds) publish a point-in-time deadline: a quiz opening, a due date.
    // Confirmed against a real UNSW Moodle export where 20 of 21 VEVENTs were
    // exactly this shape ("Assignment 3 is due", "quiz - opens ... closes"),
    // every one of them silently dropped before this fix. Treated the same as
    // "no end given at all" rather than as zero duration, so it gets the same
    // default instead of vanishing. A genuinely malformed end (unparseable, or
    // before the start) is still rejected below.
    let durationMinutes: number;
    if (event.end) {
      const endIso = toInstant(event.end);
      const explicit = endIso
        ? Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000)
        : null;

      if (explicit === null || explicit < 0) {
        durationMinutes = 0; // unparseable, or ends before it starts: genuinely invalid
      } else if (explicit === 0) {
        durationMinutes = startDate.dateOnly ? 24 * 60 : 60; // point-in-time deadline
      } else {
        durationMinutes = explicit;
      }
    } else if (event.durationMinutes !== null) {
      durationMinutes = event.durationMinutes;
    } else {
      durationMinutes = startDate.dateOnly ? 24 * 60 : 60;
    }

    if (durationMinutes <= 0) {
      skipped += 1;
      continue;
    }

    const excluded = new Set(event.exDates);
    const push = (occurrenceStartIso: string, fromRecurrence: boolean): boolean => {
      if (excluded.has(occurrenceStartIso)) return true;
      if (event.uid && overridden.has(`${event.uid}|${occurrenceStartIso}`) && fromRecurrence) {
        return true;
      }
      if (events.length >= maxEvents) {
        truncated += 1;
        return false;
      }

      events.push({
        uid: event.uid,
        summary: event.summary,
        description: event.description,
        location: event.location,
        startIso: occurrenceStartIso,
        endIso: new Date(Date.parse(occurrenceStartIso) + durationMinutes * 60_000).toISOString(),
        isAllDay: startDate.dateOnly,
        fromRecurrence,
      });
      return true;
    };

    if (!event.rrule) {
      push(startIso, false);
      continue;
    }

    const rule = parseRecurrence(event.rrule);
    if (!rule) {
      warnings.add("unsupportedRecurrence");
      push(startIso, false);
      continue;
    }

    const { starts, capped } = expandRecurrence(startDate.wall, rule, startDate.zone);
    if (capped) warnings.add("recurrenceCapped");

    for (const [index, wall] of starts.entries()) {
      const instant = wallClockToUtc(formatWall(wall), startDate.zone);
      if (!instant) continue;
      if (!push(instant, index > 0)) break;
    }
  }

  if (skipped > 0) warnings.add("skippedInvalid", skipped);
  if (truncated > 0) warnings.add("truncated", truncated);
  if (unknownZones > 0) warnings.add("unknownTimezone", unknownZones);

  events.sort((a, b) => a.startIso.localeCompare(b.startIso));

  return { calendarName, events, warnings: warnings.list() };
}
