import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { FeasibilityReport, PlannerWarning } from "@/lib/planner/types";
import { cn } from "@/lib/utils";

/**
 * The honesty panel.
 *
 * When the work does not fit, the brief is clear that the system must say so
 * plainly and offer concrete options rather than quietly producing a tidy plan
 * that drops two-thirds of the work. Remedies are actions the student can
 * actually take, not encouragement.
 */

const SEVERITY_STYLES = {
  critical: "border-destructive/40 bg-destructive/5",
  warning: "border-warning/40 bg-warning/5",
  info: "border-border bg-muted/40",
} as const;

function hours(minutes: number): number {
  return Math.round(minutes / 60);
}

export async function PlanWarnings({
  warnings,
  feasibility,
  taskTitles,
}: {
  warnings: readonly PlannerWarning[];
  feasibility: FeasibilityReport;
  /** Task id → title, so a warning can name the piece of work it is about. */
  taskTitles: ReadonlyMap<string, string>;
}) {
  const t = await getTranslations("planner");

  if (warnings.length === 0) return null;

  // Most severe first: a student skimming should meet the blocking problem
  // before the advisory ones.
  const order = { critical: 0, warning: 1, info: 2 } as const;
  const sorted = [...warnings].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <section className="space-y-3">
      <h2 className="label-caps flex items-center gap-1.5">
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        {t("warnings.title")}
      </h2>

      <ul className="space-y-2">
        {sorted.map((warning, index) => {
          const title = warning.taskId ? taskTitles.get(warning.taskId) : undefined;

          const body =
            warning.code === "not_enough_time"
              ? t("warnings.not_enough_time", {
                  requiredHours: hours(feasibility.requiredMinutes),
                  usableHours: hours(feasibility.usableMinutes),
                })
              : t(`warnings.${warning.code}`);

          return (
            <li
              key={`${warning.code}-${warning.taskId ?? index}`}
              className={cn("rounded-lg border p-3 text-sm", SEVERITY_STYLES[warning.severity])}
            >
              {title ? <span className="font-medium">{title}: </span> : null}
              <span className={warning.severity === "critical" ? "" : "text-muted-foreground"}>
                {body}
              </span>
            </li>
          );
        })}
      </ul>

      {feasibility.remedies.length > 0 ? (
        <div className="bg-card rounded-lg border p-4">
          <h3 className="label-caps text-foreground flex items-center gap-1.5">
            <Lightbulb className="size-3.5" aria-hidden="true" />
            {t("remedies.title")}
          </h3>
          <ul className="mt-3 space-y-2">
            {feasibility.remedies.map((remedy) => (
              <li key={remedy.code} className="text-muted-foreground flex gap-2 text-sm">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>{t(`remedies.${remedy.code}`, remedy.details ?? {})}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
