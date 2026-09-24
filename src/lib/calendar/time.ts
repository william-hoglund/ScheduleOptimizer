import { TZDate } from "@date-fns/tz";

/**
 * Conversions between wall-clock time and absolute instants.
 *
 * The whole product depends on getting this right, so it lives in one place.
 *
 * The trap this exists to avoid: `new Date("2026-08-01T17:00")` is parsed in
 * the *server's* timezone. On Vercel that is UTC, so a Swedish student typing
 * "17:00" would get a deadline stored two hours late in summer. Every
 * conversion must name the zone explicitly.
 *
 * Storage rule: absolute moments are `timestamptz` (UTC). Recurring
 * preferences are wall-clock `time` + `day_of_week` and never pass through
 * here — see study_preferences.
 */

/** "YYYY-MM-DDTHH:MM" as produced by `<input type="datetime-local">`. */
export type LocalDateTimeString = string;

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Wall-clock in a given zone → UTC instant.
 *
 * "2026-08-01T17:00" in Europe/Stockholm becomes 15:00Z in summer and 16:00Z
 * in winter. TZDate applies the offset that was actually in force on that date,
 * so daylight saving is handled rather than approximated.
 */
export function wallClockToUtc(value: LocalDateTimeString, timeZone: string): string | null {
  const match = LOCAL_DATE_TIME.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number) as [
    unknown,
    number,
    number,
    number,
    number,
    number,
  ];

  const date = new TZDate(year, month - 1, day, hour, minute, 0, 0, timeZone);
  if (Number.isNaN(date.getTime())) return null;

  return new Date(date.getTime()).toISOString();
}

/** UTC instant → "YYYY-MM-DDTHH:MM" wall-clock, for filling a form field. */
export function utcToWallClock(iso: string, timeZone: string): LocalDateTimeString {
  const date = new TZDate(new Date(iso).getTime(), timeZone);

  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** UTC instant → "YYYY-MM-DD" in the given zone. */
export function utcToLocalDate(iso: string, timeZone: string): string {
  return utcToWallClock(iso, timeZone).slice(0, 10);
}

/** Minutes between two instants. Negative if `end` precedes `start`. */
export function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}
