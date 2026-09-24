import { utcToLocalDate, wallClockToUtc } from "@/lib/calendar/time";
import type { EpochMinutes } from "./types";

/**
 * The bridge between local calendar dates and the engine's absolute timeline.
 *
 * Everything time-zone-aware happens here. Once availability windows exist as
 * epoch minutes, the rest of the engine is pure arithmetic — which is why a
 * daylight-saving change cannot corrupt scoring or placement.
 */

export const MINUTES_PER_DAY = 1440;

export function toEpochMinutes(iso: string): EpochMinutes {
  return Math.round(new Date(iso).getTime() / 60_000);
}

export function fromEpochMinutes(minutes: EpochMinutes): string {
  return new Date(minutes * 60_000).toISOString();
}

/**
 * A wall-clock date and time in a zone → an absolute point.
 *
 * Returns null for times that do not exist, which happens on the spring-forward
 * night: 02:30 simply never occurs. Callers skip those rather than inventing a
 * moment.
 */
export function localToEpochMinutes(
  date: string,
  time: string,
  timeZone: string,
): EpochMinutes | null {
  const iso = wallClockToUtc(`${date}T${time}`, timeZone);
  return iso ? toEpochMinutes(iso) : null;
}

export function epochMinutesToLocalDate(minutes: EpochMinutes, timeZone: string): string {
  return utcToLocalDate(fromEpochMinutes(minutes), timeZone);
}

/**
 * ISO weekday for a "YYYY-MM-DD" string: 1 = Monday .. 7 = Sunday.
 *
 * Parsed as UTC on purpose — a date with no time has no zone, and letting the
 * host's offset creep in would shift the weekday for anyone west of Greenwich.
 */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** The calendar day after a local date. Date-only arithmetic, so DST-safe. */
export function nextLocalDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Inclusive list of local dates, walked one calendar day at a time. */
export function localDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return dates;

  // Stepping in UTC days over date-only values is exact: no DST, because there
  // is no time-of-day involved.
  for (let t = start; t <= end; t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }

  return dates;
}

/** Minutes past local midnight, used for energy and late-hour scoring. */
export function minutesIntoLocalDay(minutes: EpochMinutes, timeZone: string): number {
  const date = epochMinutesToLocalDate(minutes, timeZone);
  const midnight = localToEpochMinutes(date, "00:00", timeZone);
  // Midnight itself can be skipped by a DST jump in a few zones; fall back to
  // a modulo, which is close enough for scoring.
  if (midnight === null) return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return minutes - midnight;
}

export function parseTimeOfDay(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
}
