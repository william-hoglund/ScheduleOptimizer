import { getTranslations } from "next-intl/server";

import type { ForecastPressure, HorizonForecast } from "@/lib/intelligence/workload-forecast";
import { cn } from "@/lib/utils";

/**
 * Three horizon cards (7/14/30 days) from the deterministic workload
 * forecast (`lib/intelligence/workload-forecast.ts`). Calm by design — only
 * "critical" reaches for the destructive color, matching the brief's "avoid
 * an alarming UI" instruction and the same severity→color convention
 * `plan-warnings.tsx` already uses for the planner's own warnings.
 */

const PRESSURE_STYLES: Record<ForecastPressure, string> = {
  normal: "border-border bg-muted/40 text-muted-foreground",
  elevated: "border-warning/30 bg-warning/5 text-warning",
  high: "border-warning/40 bg-warning/10 text-warning",
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
};

function hours(minutes: number): number {
  return Math.round(minutes / 60);
}

export async function WorkloadForecastPanel({ forecasts }: { forecasts: readonly HorizonForecast[] }) {
  const t = await getTranslations("intelligence.forecast");
  const tPlanner = await getTranslations("planner");

  return (
    <section className="space-y-3">
      <h2 className="label-caps text-foreground">{t("title")}</h2>

      <div className="grid gap-3 sm:grid-cols-3">
        {forecasts.map((forecast) => (
          <div key={forecast.horizonDays} className="bg-card space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="label-caps">{t(`horizon.${forecast.horizonDays}`)}</p>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs font-medium",
                  PRESSURE_STYLES[forecast.pressure],
                )}
              >
                {t(`pressure.${forecast.pressure}`)}
              </span>
            </div>

            <div className="text-numeric flex items-baseline gap-3 text-sm">
              <span>
                {t("requiredLabel")}: <span className="font-semibold">{hours(forecast.requiredMinutes)}h</span>
              </span>
              <span className="text-muted-foreground">
                {t("availableLabel")}: {hours(forecast.availableMinutes)}h
              </span>
            </div>

            {forecast.mainReason ? (
              <p className="text-muted-foreground text-sm">
                {t(`reasons.${forecast.mainReason.code}`, forecast.mainReason.details ?? {})}
              </p>
            ) : null}

            {forecast.remedies.length > 0 ? (
              <ul className="space-y-1">
                {forecast.remedies.map((remedy) => (
                  <li key={remedy.code} className="text-muted-foreground text-xs">
                    {tPlanner(`remedies.${remedy.code}`, remedy.details ?? {})}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
