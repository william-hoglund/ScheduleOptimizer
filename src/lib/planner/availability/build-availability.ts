import { applyDayEffects } from "./apply-day-effects";
import { mergeIntervals, subtractIntervals } from "../interval";
import {
  epochMinutesToLocalDate,
  isoWeekday,
  localDatesInRange,
  localToEpochMinutes,
} from "../time-grid";
import type {
  EpochMinutes,
  Interval,
  PlannerAvailabilityRule,
  PlannerCalendarSource,
  PlannerFixedEvent,
  PlannerPreferences,
} from "../types";

/**
 * Turns recurring wall-clock rules into concrete windows on the timeline.
 *
 * This is the only place daylight saving matters. Each day's window is built
 * from that day's local "HH:MM" values, so on the night the clocks change the
 * window is genuinely 23 or 25 hours' worth of offset — not an assumed 24.
 *
 * The model:
 *   - preferences give the default daily window (earliest → latest) on the days
 *     the student chose;
 *   - `available` rules ADD extra windows (studying Saturday morning anyway);
 *   - `unavailable` rules SUBTRACT (a standing commitment);
 *   - `preferred` rules add no time, they only earn a scoring bonus later.
 */

export type AvailabilityResult = {
  /** Free time, after fixed events and unavailable rules are removed. */
  windows: Interval[];
  /** Windows the student marked as preferred, for scoring. Not extra time. */
  preferredWindows: Interval[];
  /** Free minutes per local date, used to enforce the daily cap. */
  minutesByDate: Map<string, number>;
  /**
   * Local dates whose study capacity a calendar has lowered — a working day
   * leaves an evening on the clock but not in practice. Empty when no imported
   * calendar carries a day rule.
   */
  dailyCapByDate: Map<string, number>;
  /** What was applied, so the student can be told why a day is empty. */
  dayEffects: ReturnType<typeof applyDayEffects>["applied"];
};

function windowForDay(
  date: string,
  startTime: string,
  endTime: string,
  timeZone: string,
): Interval | null {
  const start = localToEpochMinutes(date, startTime, timeZone);
  const end = localToEpochMinutes(date, endTime, timeZone);

  // A time that does not exist on this date (spring forward) yields null.
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

export function buildAvailability({
  horizonStartDate,
  horizonEndDate,
  timeZone,
  preferences,
  availabilityRules,
  fixedEvents,
  calendarSources,
  now,
}: {
  horizonStartDate: string;
  horizonEndDate: string;
  timeZone: string;
  preferences: PlannerPreferences;
  availabilityRules: readonly PlannerAvailabilityRule[];
  fixedEvents: readonly PlannerFixedEvent[];
  calendarSources: readonly PlannerCalendarSource[];
  now: EpochMinutes;
}): AvailabilityResult {
  const dates = localDatesInRange(horizonStartDate, horizonEndDate);
  const base: Interval[] = [];
  const preferred: Interval[] = [];
  const blocked: Interval[] = [];

  const allowedDays = new Set(preferences.preferredDays);

  for (const date of dates) {
    const weekday = isoWeekday(date);
    const isWeekend = weekday === 6 || weekday === 7;

    // Weekends are opt-in: the brief is explicit that the planner should not
    // quietly colonise a student's weekend.
    const dayAllowed = allowedDays.has(weekday) && (!isWeekend || preferences.weekendAllowed);

    if (dayAllowed) {
      const window = windowForDay(
        date,
        preferences.earliestStartTime,
        preferences.latestEndTime,
        timeZone,
      );
      if (window) base.push(window);
    }

    for (const rule of availabilityRules) {
      if (rule.dayOfWeek !== weekday) continue;

      const window = windowForDay(date, rule.startTime, rule.endTime, timeZone);
      if (!window) continue;

      if (rule.ruleType === "available") base.push(window);
      else if (rule.ruleType === "unavailable") blocked.push(window);
      else preferred.push(window);
    }
  }

  // Fixed commitments block study time; movable ones deliberately do not.
  for (const event of fixedEvents) {
    if (event.isFixed && event.end > event.start) {
      blocked.push({ start: event.start, end: event.end });
    }
  }

  /**
   * A day given over to work is not a day with a free evening. Whole days that
   * an imported calendar has claimed are removed here rather than penalised
   * later — it is an absolute rule, and §"hard constraints are absolute" says
   * those belong in the shape of availability, not in the scorer.
   */
  const dayEffects = applyDayEffects({ fixedEvents, calendarSources, timeZone });
  blocked.push(...dayEffects.blockedIntervals);

  // Nothing can be scheduled in the past.
  blocked.push({ start: Number.NEGATIVE_INFINITY, end: now });

  const windows = subtractIntervals(mergeIntervals(base), blocked);

  const minutesByDate = new Map<string, number>();
  for (const window of windows) {
    // Attributed to the local date of its start. Windows never cross midnight,
    // because latestEndTime is a time-of-day on the same date.
    const date = epochMinutesToLocalDate(window.start, timeZone);
    minutesByDate.set(date, (minutesByDate.get(date) ?? 0) + (window.end - window.start));
  }

  return {
    windows,
    preferredWindows: mergeIntervals(preferred),
    minutesByDate,
    dailyCapByDate: dayEffects.capByDate,
    dayEffects: dayEffects.applied,
  };
}
