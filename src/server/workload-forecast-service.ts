import "server-only";

import {
  buildHorizonForecast,
  type ForecastHorizonDays,
  type HorizonForecast,
} from "@/lib/intelligence/workload-forecast";
import { utcToLocalDate } from "@/lib/calendar/time";
import { buildAvailability } from "@/lib/planner/availability/build-availability";
import { toEpochMinutes } from "@/lib/planner/time-grid";
import { buildPlannerInput } from "./planner-service";

/**
 * Turns the deterministic forecast math in `lib/intelligence/workload-forecast.ts`
 * into something the database can feed: one `HorizonForecast` per window,
 * built by reusing exactly what the real planner already uses to see a given
 * date range — `buildPlannerInput` (tasks/preferences/rules/fixed
 * events/calendar sources) and `buildAvailability` (the same day-effect-aware
 * free-time calculation the engine itself runs on). No caching, no new table:
 * recomputed on read, same discipline as `insights-service.ts`.
 */

const HORIZONS: readonly ForecastHorizonDays[] = [7, 14, 30];

/** Local-date arithmetic only — no time-of-day, so no DST concern. */
function addLocalDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export async function getWorkloadForecast({
  userId,
  timeZone,
  nowIso,
}: {
  userId: string;
  timeZone: string;
  nowIso: string;
}): Promise<HorizonForecast[]> {
  const today = utcToLocalDate(nowIso, timeZone);

  const forecasts: HorizonForecast[] = [];

  for (const horizonDays of HORIZONS) {
    const horizonEndDate = addLocalDays(today, horizonDays);

    const { input, courses } = await buildPlannerInput({
      userId,
      timeZone,
      horizon: { startDate: today, endDate: horizonEndDate },
      nowIso,
      // A forecast never gets applied, only read — a fixed seed is enough to
      // make it reproducible for the length of one request.
      seed: `forecast-${horizonDays}`,
    });

    const availability = buildAvailability({
      horizonStartDate: today,
      horizonEndDate,
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

    const horizonEnd = toEpochMinutes(`${horizonEndDate}T23:59:59.999Z`);

    // Undated work is discretionary and must not inflate a specific horizon's
    // *required* minutes — only work with a deadline inside this window
    // genuinely has to happen by then.
    const tasksInHorizon = input.tasks.filter(
      (task) => task.deadline !== null && task.deadline <= horizonEnd,
    );

    const courseNameById = new Map(courses.map((course) => [course.id, course.name]));

    forecasts.push(
      buildHorizonForecast({
        horizonDays,
        tasks: tasksInHorizon,
        availableMinutes,
        preferences: input.preferences,
        now: input.now,
        horizonEnd,
        courseNameById,
      }),
    );
  }

  return forecasts;
}
