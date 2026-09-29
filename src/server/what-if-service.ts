import "server-only";

import { utcToLocalDate } from "@/lib/calendar/time";
import { computeWhatIf, type WhatIfScenario } from "@/lib/intelligence/what-if";
import type { ForecastHorizonDays, HorizonForecast } from "@/lib/intelligence/workload-forecast";
import { toEpochMinutes } from "@/lib/planner/time-grid";
import { addLocalDays } from "./availability-lookup";
import { buildPlannerInput } from "./planner-service";

/**
 * The database bridge for What-If comparisons. `computeWhatIf` stays pure —
 * this loads the one horizon's real data (`buildPlannerInput`, same as
 * `workload-forecast-service.ts`) and hands it over. Deliberately does not
 * go through `getAvailabilityForRange`: that helper computes one
 * `availableMinutes` figure, and a comparison needs two (current and
 * projected) from the same raw inputs — `computeWhatIf` runs
 * `buildAvailability` itself, twice.
 */

export async function getWhatIfComparison({
  userId,
  timeZone,
  nowIso,
  horizonDays,
  scenario,
}: {
  userId: string;
  timeZone: string;
  nowIso: string;
  horizonDays: ForecastHorizonDays;
  scenario: WhatIfScenario;
}): Promise<{ current: HorizonForecast; projected: HorizonForecast }> {
  const today = utcToLocalDate(nowIso, timeZone);
  const horizonEndDate = addLocalDays(today, horizonDays);

  const { input, courses } = await buildPlannerInput({
    userId,
    timeZone,
    horizon: { startDate: today, endDate: horizonEndDate },
    nowIso,
    // Never applied, only read — a fixed seed is enough for one request.
    seed: `whatif-${horizonDays}-${scenario.kind}`,
  });

  const horizonEnd = toEpochMinutes(`${horizonEndDate}T23:59:59.999Z`);

  const tasksInHorizon = input.tasks.filter(
    (task) => task.deadline !== null && task.deadline <= horizonEnd,
  );

  const courseNameById = new Map(courses.map((course) => [course.id, course.name]));

  return computeWhatIf({
    scenario,
    horizonDays,
    tasks: tasksInHorizon,
    preferences: input.preferences,
    availabilityRules: input.availabilityRules,
    fixedEvents: input.fixedEvents,
    calendarSources: input.calendarSources,
    timeZone,
    horizonStartDate: today,
    horizonEndDate,
    now: input.now,
    horizonEnd,
    courseNameById,
  });
}
