import { epochMinutesToLocalDate, localToEpochMinutes, nextLocalDate } from "../time-grid";
import type { Interval, PlannerCalendarSource, PlannerFixedEvent } from "../types";

/**
 * What a working day costs the rest of the day.
 *
 * The planner already removes the hours an event occupies. That is right for a
 * 45-minute stand-up and wrong for eight hours at the office: the calendar then
 * shows a free evening that does not exist in any useful sense. Nobody comes
 * home from a full day at work and reviews lecture notes.
 *
 * So each imported calendar carries a rule — nothing, a reduced day, or no
 * study at all — and a **threshold** in minutes that decides when it applies.
 * The threshold is the whole point: a short meeting must stay an ordinary hole
 * in the day.
 *
 * Pure, and day-boundary-aware: an event is counted against each local date it
 * actually covers, so an overnight shift or a multi-day conference is charged
 * to every day it touches rather than only the one it started on.
 */

export type DayEffectOutcome = {
  /** Local dates where no study should be planned at all. */
  blockedDates: Set<string>;
  /** Local date → the reduced cap in minutes, where one applies. */
  capByDate: Map<string, number>;
  /** Whole-day intervals to subtract from availability, for the blocked dates. */
  blockedIntervals: Interval[];
  /** What was applied and why, for the warning the student sees. */
  applied: { date: string; sourceId: string; minutes: number; effect: "reduce" | "block" }[];
};

/** Minutes of an event that fall on one local date. */
function minutesOnDate(
  event: PlannerFixedEvent,
  date: string,
  timeZone: string,
): number {
  const dayStart = localToEpochMinutes(date, "00:00", timeZone);
  const dayEnd = localToEpochMinutes(nextLocalDate(date), "00:00", timeZone);
  if (dayStart === null || dayEnd === null) return 0;

  const start = Math.max(event.start, dayStart);
  const end = Math.min(event.end, dayEnd);
  return end > start ? end - start : 0;
}

/**
 * Every local date an event might touch.
 *
 * Deliberately generous at the end: a shift finishing exactly at midnight lists
 * the following date too, and `minutesOnDate` then scores it zero and drops it.
 * One mechanism for "does this day count", not two that can disagree.
 */
function datesTouched(event: PlannerFixedEvent, timeZone: string): string[] {
  const first = epochMinutesToLocalDate(event.start, timeZone);
  const last = epochMinutesToLocalDate(Math.max(event.start, event.end), timeZone);

  const dates = [first];
  let cursor = first;
  // Guarded rather than while(true): a corrupt event must not spin forever.
  for (let i = 0; i < 366 && cursor < last; i += 1) {
    cursor = nextLocalDate(cursor);
    dates.push(cursor);
  }
  return dates;
}

export function applyDayEffects({
  fixedEvents,
  calendarSources,
  timeZone,
}: {
  fixedEvents: readonly PlannerFixedEvent[];
  calendarSources: readonly PlannerCalendarSource[];
  timeZone: string;
}): DayEffectOutcome {
  const outcome: DayEffectOutcome = {
    blockedDates: new Set(),
    capByDate: new Map(),
    blockedIntervals: [],
    applied: [],
  };

  const rules = new Map(
    calendarSources.filter((source) => source.dayEffect !== "none").map((s) => [s.id, s]),
  );
  if (rules.size === 0) return outcome;

  // date → source → minutes that calendar occupies on that date.
  const totals = new Map<string, Map<string, number>>();

  for (const event of fixedEvents) {
    const rule = event.sourceId ? rules.get(event.sourceId) : undefined;
    if (!rule || event.end <= event.start) continue;

    for (const date of datesTouched(event, timeZone)) {
      const minutes = minutesOnDate(event, date, timeZone);
      if (minutes <= 0) continue;

      const perSource = totals.get(date) ?? new Map<string, number>();
      perSource.set(rule.id, (perSource.get(rule.id) ?? 0) + minutes);
      totals.set(date, perSource);
    }
  }

  for (const [date, perSource] of totals) {
    for (const [sourceId, minutes] of perSource) {
      const rule = rules.get(sourceId);
      if (!rule || minutes < rule.thresholdMinutes) continue;

      if (rule.dayEffect === "block") {
        outcome.blockedDates.add(date);
        // A blocked day also carries a cap of zero, so anything that reads caps
        // rather than windows — feasibility, for one — agrees with placement.
        outcome.capByDate.set(date, 0);
        outcome.applied.push({ date, sourceId, minutes, effect: "block" });

        const start = localToEpochMinutes(date, "00:00", timeZone);
        const end = localToEpochMinutes(nextLocalDate(date), "00:00", timeZone);
        if (start !== null && end !== null) outcome.blockedIntervals.push({ start, end });
        continue;
      }

      // Two calendars can both claim the same day. The strictest wins: if one
      // says 30 minutes and the other 60, the day has 30.
      const existing = outcome.capByDate.get(date);
      const cap = existing === undefined
        ? rule.reducedDailyMinutes
        : Math.min(existing, rule.reducedDailyMinutes);
      outcome.capByDate.set(date, cap);
      outcome.applied.push({ date, sourceId, minutes, effect: "reduce" });
    }
  }

  return outcome;
}

/**
 * Free minutes, with day rules applied.
 *
 * Summing the windows would count the evening of a working day as capacity the
 * student has already told us they will not use, and feasibility would then
 * call an impossible week fine.
 *
 * Only day *rules* clamp here. The ordinary daily limit is deliberately left
 * out: placement has always enforced it separately, and folding it in would
 * quietly change every existing feasibility number.
 */
export function capacityWithDayCaps(
  windows: readonly Interval[],
  capByDate: ReadonlyMap<string, number>,
  timeZone: string,
): number {
  if (capByDate.size === 0) {
    return windows.reduce((sum, window) => sum + (window.end - window.start), 0);
  }

  const byDate = new Map<string, number>();
  for (const window of windows) {
    const date = epochMinutesToLocalDate(window.start, timeZone);
    byDate.set(date, (byDate.get(date) ?? 0) + (window.end - window.start));
  }

  let total = 0;
  for (const [date, minutes] of byDate) {
    const cap = capByDate.get(date);
    total += cap === undefined ? minutes : Math.min(minutes, cap);
  }
  return total;
}

/** The cap for one date: a day rule if there is one, otherwise the daily limit. */
export function dailyCapFor(
  date: string,
  capByDate: ReadonlyMap<string, number>,
  defaultCap: number,
): number {
  const cap = capByDate.get(date);
  return cap === undefined ? defaultCap : Math.min(cap, defaultCap);
}
