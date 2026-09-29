import { Lightbulb, Sparkles, TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { createPageMetadata } from "@/components/layout/placeholder-page";
import { pickRecommendation } from "@/lib/briefing/pick-recommendation";
import { rankActiveInsights } from "@/lib/learning/rank-insights";
import type { CourseRow, LearningProfileInsightRow } from "@/lib/supabase/types";
import { requireUserContext } from "@/server/auth";
import { nowIso } from "@/server/clock";
import { loadInsights } from "@/server/insights-service";
import { listLearningProfileInsights } from "@/server/learning-profile-service";
import { getWorkloadForecast } from "@/server/workload-forecast-service";

export const generateMetadata = () => createPageMetadata("weeklyReview");

function hours(minutes: number): number {
  return Math.round(minutes / 60);
}

/**
 * The same three sentence shapes `learning-profile-panel.tsx` renders on
 * Insights, reused here for the single highest-confidence insight — kept as
 * a plain function (not shared JSX) since this page is a server component
 * and the panel is a client one. Namespaced translators, not the global `t`
 * — a dynamically-keyed lookup against the full, very large message tree
 * blows past TypeScript's type-instantiation depth limit (see
 * `plan-warnings.tsx` for the same pattern with `getTranslations("planner")`).
 */
function describeInsight(
  insight: LearningProfileInsightRow,
  courses: readonly CourseRow[],
  tLearning: Awaited<ReturnType<typeof getTranslations<"learning">>>,
  tInsights: Awaited<ReturnType<typeof getTranslations<"insights">>>,
): string {
  if (insight.insight_type === "best_study_band") {
    const { band } = insight.computed_value as { band: "morning" | "afternoon" | "evening" };
    return tLearning("bestStudyBand", { band: tInsights(`bands.${band}`) });
  }

  if (insight.insight_type === "estimation_bias") {
    const { direction, ratioPercent } = insight.computed_value as {
      direction: "underestimates" | "overestimates" | "accurate";
      ratioPercent: number;
    };
    return direction === "accurate"
      ? tLearning("estimationBias.accurate")
      : tLearning(`estimationBias.${direction}`, { percent: ratioPercent });
  }

  const courseName = courses.find((course) => course.id === insight.course_id)?.name ?? "";
  return tLearning("coursePostponementRisk", { courseName });
}

export default async function WeeklyReviewPage() {
  const { user, timeZone } = await requireUserContext();
  const t = await getTranslations();
  // Namespaced translators for every *dynamically*-keyed lookup below — see
  // `describeInsight`'s comment for why the root `t` cannot be used for those.
  const tForecast = await getTranslations("intelligence.forecast");
  const tPlanner = await getTranslations("planner");
  const tLearning = await getTranslations("learning");
  const tInsights = await getTranslations("insights");
  const now = nowIso();

  const bundle = await loadInsights({ userId: user.id, nowIso: now, timeZone, days: 7 });

  const forecasts = await getWorkloadForecast({ userId: user.id, timeZone, nowIso: now });
  const sevenDayForecast = forecasts.find((forecast) => forecast.horizonDays === 7) ?? null;
  const recommendation = pickRecommendation(sevenDayForecast);

  /** Same degrade pattern as Insights — a missing 0012 table hides only this card. */
  let topInsight: LearningProfileInsightRow | null = null;
  let learningAvailable = true;
  try {
    topInsight = rankActiveInsights(await listLearningProfileInsights(user.id))[0] ?? null;
  } catch (cause) {
    console.error("[weekly-review] learning profile unavailable:", cause);
    learningAvailable = false;
  }

  const learnedSentence = topInsight
    ? describeInsight(topInsight, bundle.courses, tLearning, tInsights)
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("pages.weeklyReview.title")}
        description={t("pages.weeklyReview.description")}
      />

      <section className="space-y-3">
        <h2 className="label-caps text-foreground">{t("weeklyReview.yourWeek")}</h2>

        {bundle.insights.consideredSessions === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title={t("weeklyReview.notEnoughData")}
            description={t("pages.insights.emptyBody")}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="bg-card rounded-lg border p-4">
              <p className="label-caps">{t("weeklyReview.planned")}</p>
              <p className="text-numeric mt-1 text-xl font-semibold">{bundle.insights.plannedMinutes} min</p>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <p className="label-caps">{t("weeklyReview.completed")}</p>
              <p className="text-numeric mt-1 text-xl font-semibold">{bundle.insights.completedMinutes} min</p>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <p className="label-caps">{t("weeklyReview.adherence")}</p>
              <p className="text-numeric mt-1 text-xl font-semibold">
                {bundle.insights.adherence === null ? "—" : `${Math.round(bundle.insights.adherence * 100)}%`}
              </p>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <p className="label-caps">{t("weeklyReview.rescheduled")}</p>
              <p className="text-numeric mt-1 text-xl font-semibold">{bundle.insights.rescheduledCount}</p>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <p className="label-caps">{t("weeklyReview.sessionsCompleted")}</p>
              <p className="text-numeric mt-1 text-xl font-semibold">{bundle.insights.completedCount}</p>
            </div>
          </div>
        )}
      </section>

      {learningAvailable ? (
        <section className="bg-card space-y-1 rounded-lg border p-4">
          <h2 className="label-caps text-foreground flex items-center gap-1.5">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {t("weeklyReview.systemLearned")}
          </h2>
          {learnedSentence ? (
            <p className="text-sm">{learnedSentence}</p>
          ) : (
            <p className="text-muted-foreground text-sm">{tLearning("stillLearning")}</p>
          )}
        </section>
      ) : null}

      <section className="bg-card space-y-2 rounded-lg border p-4">
        <h2 className="label-caps text-foreground">{t("weeklyReview.nextWeek")}</h2>
        {sevenDayForecast ? (
          <div className="text-numeric flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span>
              {t("weeklyReview.expectedWorkload")}:{" "}
              <span className="font-medium">{hours(sevenDayForecast.requiredMinutes)}h</span>
            </span>
            <span className="text-muted-foreground">
              {t("weeklyReview.availableCapacity")}: {hours(sevenDayForecast.availableMinutes)}h
            </span>
            <span className="font-medium">{tForecast(`pressure.${sevenDayForecast.pressure}`)}</span>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="label-caps flex items-center gap-1.5">
          <Lightbulb className="size-3.5" aria-hidden="true" />
          {t("weeklyReview.recommendationTitle")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {recommendation
            ? tPlanner(`remedies.${recommendation.code}`, recommendation.details ?? {})
            : t("weeklyReview.recommendationNone")}
        </p>
      </section>
    </div>
  );
}
