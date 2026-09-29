import "server-only";

import {
  buildHorizonForecast,
  type ForecastHorizonDays,
  type HorizonForecast,
} from "@/lib/intelligence/workload-forecast";
import { utcToLocalDate } from "@/lib/calendar/time";
import { toEpochMinutes } from "@/lib/planner/time-grid";
import { addLocalDays, getAvailabilityForRange } from "./availability-lookup";

/**
 * Turns the deterministic forecast math in `lib/intelligence/workload-forecast.ts`
 * into something the database can feed: one `HorizonForecast` per window,
 * built from `getAvailabilityForRange` (the same day-effect-aware free-time
 * calculation the engine itself runs on, shared with
 * `daily-briefing-service.ts`). No caching, no new table: recomputed on read,
 * same discipline as `insights-service.ts`.
 */

const HORIZONS: readonly ForecastHorizonDays[] = [7, 14, 30];

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

    const { availableMinutes, input, courses } = await getAvailabilityForRange({
      userId,
      timeZone,
      nowIso,
      range: { startDate: today, endDate: horizonEndDate },
      // A forecast never gets applied, only read — a fixed seed is enough to
      // make it reproducible for the length of one request.
      seed: `forecast-${horizonDays}`,
    });

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
