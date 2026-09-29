import "server-only";

import { buildAvailability } from "@/lib/planner/availability/build-availability";
import type { PlannerInput } from "@/lib/planner/types";
import type { CourseRow } from "@/lib/supabase/types";
import { buildPlannerInput, type PlanHorizon } from "./planner-service";

/**
 * How much free study time exists in a date range, computed exactly the way
 * the real planner sees it — `buildPlannerInput` (tasks/preferences/rules/
 * fixed events/calendar sources) into `buildAvailability` (the same
 * day-effect-aware free-time calculation the engine itself runs on).
 *
 * Shared by `workload-forecast-service.ts` (one call per horizon) and
 * `daily-briefing-service.ts` (one call for today) so this sequence exists in
 * exactly one place.
 */

/** Local-date arithmetic only — no time-of-day, so no DST concern. */
export function addLocalDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export async function getAvailabilityForRange({
  userId,
  timeZone,
  nowIso,
  range,
  seed,
}: {
  userId: string;
  timeZone: string;
  nowIso: string;
  range: PlanHorizon;
  seed: string;
}): Promise<{ availableMinutes: number; input: PlannerInput; courses: CourseRow[] }> {
  const { input, courses } = await buildPlannerInput({
    userId,
    timeZone,
    horizon: range,
    nowIso,
    seed,
  });

  const availability = buildAvailability({
    horizonStartDate: range.startDate,
    horizonEndDate: range.endDate,
    timeZone,
    preferences: input.preferences,
    availabilityRules: input.availabilityRules,
    fixedEvents: input.fixedEvents,
    calendarSources: input.calendarSources,
    now: input.now,
  });

  const availableMinutes = [...availability.minutesByDate.values()].reduce(
    (sum, minutes) => sum + minutes,
    0,
  );

  return { availableMinutes, input, courses };
}
