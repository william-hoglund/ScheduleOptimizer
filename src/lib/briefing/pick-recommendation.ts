import type { HorizonForecast } from "@/lib/intelligence/workload-forecast";
import type { PlannerRemedy } from "@/lib/planner/types";

/**
 * Which single remedy leads the Weekly Review's recommendation. Isolated in
 * its own pure function — worth pinning with a test independent of the page
 * that renders it, same reasoning as `deriveMainReason` in the forecast.
 */
export function pickRecommendation(forecast: HorizonForecast | null): PlannerRemedy | null {
  return forecast?.remedies[0] ?? null;
}
