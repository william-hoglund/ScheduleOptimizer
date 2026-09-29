import { buildAvailability } from "@/lib/planner/availability/build-availability";
import type {
  EpochMinutes,
  PlannerAvailabilityRule,
  PlannerCalendarSource,
  PlannerFixedEvent,
  PlannerPreferences,
  PlannerTask,
} from "@/lib/planner/types";
import { buildHorizonForecast, type ForecastHorizonDays, type HorizonForecast } from "./workload-forecast";

/**
 * "What happens if...?" — built entirely from pieces that already exist.
 * `buildHorizonForecast` (Session 20) was deliberately shaped to take plain
 * data rather than read anything itself, specifically so a comparison like
 * this could call it twice — once with the real inputs, once with a
 * perturbed copy — with no changes to it at all. This file adds zero new
 * forecast math: only the two ways of perturbing the inputs before handing
 * them to the same function that already produces a real `HorizonForecast`.
 *
 * Nothing here writes anywhere — a what-if is inherently read-only.
 */

export type WhatIfScenario =
  | { kind: "skip_day"; dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7 }
  | { kind: "extra_commitment"; hours: number };

export function computeWhatIf({
  scenario,
  horizonDays,
  tasks,
  preferences,
  availabilityRules,
  fixedEvents,
  calendarSources,
  timeZone,
  horizonStartDate,
  horizonEndDate,
  now,
  horizonEnd,
  courseNameById,
}: {
  scenario: WhatIfScenario;
  horizonDays: ForecastHorizonDays;
  /** Already filtered to this horizon (deadline within it) by the caller. */
  tasks: readonly PlannerTask[];
  preferences: PlannerPreferences;
  availabilityRules: readonly PlannerAvailabilityRule[];
  fixedEvents: readonly PlannerFixedEvent[];
  calendarSources: readonly PlannerCalendarSource[];
  timeZone: string;
  horizonStartDate: string;
  horizonEndDate: string;
  now: EpochMinutes;
  horizonEnd: EpochMinutes;
  courseNameById: ReadonlyMap<string, string>;
}): { current: HorizonForecast; projected: HorizonForecast } {
  const availableMinutesFor = (prefs: PlannerPreferences): number => {
    const availability = buildAvailability({
      horizonStartDate,
      horizonEndDate,
      timeZone,
      preferences: prefs,
      availabilityRules,
      fixedEvents,
      calendarSources,
      now,
    });
    return [...availability.minutesByDate.values()].reduce((sum, minutes) => sum + minutes, 0);
  };

  const currentAvailableMinutes = availableMinutesFor(preferences);
  const current = buildHorizonForecast({
    horizonDays,
    tasks,
    availableMinutes: currentAvailableMinutes,
    preferences,
    now,
    horizonEnd,
    courseNameById,
  });

  const projectedPreferences: PlannerPreferences =
    scenario.kind === "skip_day"
      ? {
          ...preferences,
          preferredDays: preferences.preferredDays.filter((day) => day !== scenario.dayOfWeek),
        }
      : preferences;

  const projectedAvailableMinutes =
    scenario.kind === "skip_day"
      ? availableMinutesFor(projectedPreferences)
      : Math.max(0, currentAvailableMinutes - scenario.hours * 60);

  const projected = buildHorizonForecast({
    horizonDays,
    tasks,
    availableMinutes: projectedAvailableMinutes,
    preferences: projectedPreferences,
    now,
    horizonEnd,
    courseNameById,
  });

  return { current, projected };
}
