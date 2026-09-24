import { AlertTriangle, TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/common/empty-state";
import type { Insights } from "@/lib/insights/compute-insights";
import type { CourseRow } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

/**
 * Study statistics.
 *
 * The brief asks for figures that do not create performance anxiety, so this
 * shows what happened rather than scoring it: no targets, no streaks-you-broke,
 * no red unless something genuinely will not fit. Where there is not enough
 * data, it says so instead of drawing a chart of noise.
 */

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <p className="label-caps">{label}</p>
      <p className="text-numeric mt-1 text-xl font-semibold">{value}</p>
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

/**
 * A day-by-day strip.
 *
 * Bars rather than a line chart: the question a student asks is "which days did
 * I actually study?", and discrete days answer it directly. Empty days are
 * drawn as empty, never skipped.
 */
function ActivityStrip({
  daily,
  label,
  hint,
}: {
  daily: Array<{ date: string; plannedMinutes: number; completedMinutes: number }>;
  label: string;
  hint: string;
}) {
  const peak = Math.max(
    60,
    ...daily.map((day) => Math.max(day.plannedMinutes, day.completedMinutes)),
  );

  return (
    <section className="bg-card rounded-lg border p-4">
      <h2 className="label-caps text-foreground">{label}</h2>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>

      <div className="mt-4 flex items-end gap-[3px]" style={{ height: "4rem" }}>
        {daily.map((day) => {
          const plannedHeight = (day.plannedMinutes / peak) * 100;
          const doneHeight = (day.completedMinutes / peak) * 100;

          return (
            <div
              key={day.date}
              className="relative flex-1"
              style={{ height: "100%" }}
              title={`${day.date}: ${day.completedMinutes}/${day.plannedMinutes} min`}
            >
              <span
                className="bg-muted absolute bottom-0 w-full rounded-sm"
                style={{ height: `${Math.max(plannedHeight, 2)}%` }}
                aria-hidden="true"
              />
              <span
                className="bg-success absolute bottom-0 w-full rounded-sm"
                style={{ height: `${doneHeight}%` }}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>

      {/* The numbers are the accessible version of the bars above. */}
      <p className="sr-only">
        {daily
          .map((day) => `${day.date}: ${day.completedMinutes} of ${day.plannedMinutes} minutes`)
          .join(". ")}
      </p>
    </section>
  );
}

export async function InsightsPanel({
  insights,
  daily,
  courses,
}: {
  insights: Insights;
  daily: Array<{ date: string; plannedMinutes: number; completedMinutes: number }>;
  courses: CourseRow[];
}) {
  const t = await getTranslations("insights");

  if (insights.consideredSessions === 0) {
    return <EmptyState icon={TrendingUp} title={t("notEnough")} description={t("notEnoughBody")} />;
  }

  const courseById = new Map(courses.map((course) => [course.id, course]));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("adherence")}
          value={insights.adherence === null ? "—" : `${Math.round(insights.adherence * 100)}%`}
          hint={t("adherenceHint")}
        />
        <Stat label={t("completedTime")} value={`${insights.completedMinutes} min`} />
        <Stat label={t("plannedTime")} value={`${insights.plannedMinutes} min`} />
        <Stat
          label={t("averageSession")}
          value={
            insights.averageSessionMinutes === null ? "—" : `${insights.averageSessionMinutes} min`
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t("sessionsDone")} value={String(insights.completedCount)} />
        <Stat label={t("sessionsMissed")} value={String(insights.missedCount)} />
        <Stat label={t("rescheduled")} value={String(insights.rescheduledCount)} />
      </div>

      <ActivityStrip daily={daily} label={t("activity")} hint={t("activityHint")} />

      <section className="bg-card rounded-lg border p-4">
        <h2 className="label-caps text-foreground">{t("bestTime")}</h2>
        <p className="mt-1 text-sm">
          {insights.bestBand ? (
            <span className="font-medium">{t(`bands.${insights.bestBand}`)}</span>
          ) : (
            <span className="text-muted-foreground">{t("bestTimeUnknown")}</span>
          )}
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="label-caps flex items-center gap-1.5">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            {t("atRisk")}
          </h2>
        </div>

        {insights.coursesAtRisk.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("nothingAtRisk")}</p>
        ) : (
          <>
            <p className="text-muted-foreground text-xs">{t("atRiskHint")}</p>
            <ul className="space-y-2">
              {insights.coursesAtRisk.map((risk) => {
                const course = risk.courseId ? courseById.get(risk.courseId) : undefined;
                const days = Math.max(0, Math.round(risk.minutesUntilDeadline / 1440));

                return (
                  <li
                    key={`${risk.courseId ?? "none"}-${risk.taskTitle}`}
                    className={cn(
                      "bg-card flex items-start gap-3 rounded-lg border p-3",
                      risk.pressure > 1 && "border-warning/50",
                    )}
                  >
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: course?.color ?? "var(--warning)" }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{risk.taskTitle}</p>
                      <p className="text-muted-foreground text-numeric text-xs">
                        {t("atRiskItem", { minutes: risk.remainingMinutes, days })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {insights.workloadBeforeNextDeadline.deadline ? (
        <section className="bg-card rounded-lg border p-4">
          <h2 className="label-caps text-foreground">{t("nextDeadlineLoad")}</h2>
          <p className="text-numeric mt-1 text-sm">
            {t("nextDeadlineLoadValue", {
              minutes: insights.workloadBeforeNextDeadline.remainingMinutes,
            })}
          </p>
        </section>
      ) : null}
    </div>
  );
}
