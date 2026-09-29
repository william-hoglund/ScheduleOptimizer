"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compareWhatIf } from "@/features/insights/actions";
import type { ForecastPressure, HorizonForecast } from "@/lib/intelligence/workload-forecast";
import type { WhatIfScenario } from "@/lib/intelligence/what-if";
import { cn } from "@/lib/utils";

/**
 * "What happens if...?" — a small form over the read-only
 * `compareWhatIf` action. Nothing here ever writes to the database; the
 * comparison is discarded the moment the panel closes or a new one is run.
 */

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const PRESSURE_STYLES: Record<ForecastPressure, string> = {
  normal: "border-border bg-muted/40 text-muted-foreground",
  elevated: "border-warning/30 bg-warning/5 text-warning",
  high: "border-warning/40 bg-warning/10 text-warning",
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
};

function hours(minutes: number): number {
  return Math.round(minutes / 60);
}

function ForecastColumn({ label, forecast }: { label: string; forecast: HorizonForecast }) {
  const t = useTranslations("intelligence.forecast");

  return (
    <div className="bg-card space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="label-caps">{label}</p>
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
    </div>
  );
}

export function WhatIfPanel() {
  const t = useTranslations("whatIf");
  const tDays = useTranslations("days");
  const tForecast = useTranslations("intelligence.forecast");

  const [horizonDays, setHorizonDays] = useState<7 | 14 | 30>(7);
  const [scenarioKind, setScenarioKind] = useState<WhatIfScenario["kind"]>("skip_day");
  const [dayOfWeek, setDayOfWeek] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(4);
  const [extraHours, setExtraHours] = useState(5);
  const [result, setResult] = useState<{ current: HorizonForecast; projected: HorizonForecast } | null>(
    null,
  );
  const [errored, setErrored] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCompare() {
    setErrored(false);
    const scenario: WhatIfScenario =
      scenarioKind === "skip_day" ? { kind: "skip_day", dayOfWeek } : { kind: "extra_commitment", hours: extraHours };

    startTransition(async () => {
      const outcome = await compareWhatIf({ horizonDays, scenario });
      if (outcome.ok) setResult(outcome.data);
      else setErrored(true);
    });
  }

  return (
    <section className="bg-card space-y-4 rounded-lg border p-4">
      <div>
        <h2 className="label-caps text-foreground flex items-center gap-1.5">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {t("horizonLabel")}
          <select
            className={SELECT_CLASS}
            value={horizonDays}
            onChange={(event) => setHorizonDays(Number(event.target.value) as 7 | 14 | 30)}
          >
            <option value={7}>{tForecast("horizon.7")}</option>
            <option value={14}>{tForecast("horizon.14")}</option>
            <option value={30}>{tForecast("horizon.30")}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("scenarioLabel")}
          <select
            className={SELECT_CLASS}
            value={scenarioKind}
            onChange={(event) => setScenarioKind(event.target.value as WhatIfScenario["kind"])}
          >
            <option value="skip_day">{t("scenario.skip_day")}</option>
            <option value="extra_commitment">{t("scenario.extra_commitment")}</option>
          </select>
        </label>

        {scenarioKind === "skip_day" ? (
          <label className="flex flex-col gap-1 text-sm">
            {t("dayLabel")}
            <select
              className={SELECT_CLASS}
              value={dayOfWeek}
              onChange={(event) => setDayOfWeek(Number(event.target.value) as 1 | 2 | 3 | 4 | 5 | 6 | 7)}
            >
              {([1, 2, 3, 4, 5, 6, 7] as const).map((day) => (
                <option key={day} value={day}>
                  {tDays(`${day}`)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            {t("hoursLabel")}
            <Input
              type="number"
              min={0}
              max={80}
              className="w-20"
              value={extraHours}
              onChange={(event) => setExtraHours(Number(event.target.value))}
            />
          </label>
        )}

        <Button type="button" disabled={isPending} onClick={handleCompare}>
          {t("compare")}
        </Button>
      </div>

      {errored ? <p className="text-destructive text-sm">{t("failed")}</p> : null}

      {result ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ForecastColumn label={t("current")} forecast={result.current} />
          <ForecastColumn label={t("projected")} forecast={result.projected} />
        </div>
      ) : null}
    </section>
  );
}
