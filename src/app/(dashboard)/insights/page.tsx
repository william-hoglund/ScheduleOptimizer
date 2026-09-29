import { getTranslations } from "next-intl/server";

import { GroupBoard } from "@/components/groups/group-board";
import { GroupSetup } from "@/components/groups/group-setup";
import { InsightsPanel } from "@/components/insights/insights-panel";
import { LearningProfilePanel } from "@/components/insights/learning-profile-panel";
import { WorkloadForecastPanel } from "@/components/insights/workload-forecast-panel";
import { PageHeader } from "@/components/layout/page-header";
import { createPageMetadata } from "@/components/layout/placeholder-page";
import type { HorizonForecast } from "@/lib/intelligence/workload-forecast";
import type { LearningProfileInsightRow } from "@/lib/supabase/types";
import { requireUserContext } from "@/server/auth";
import { nowIso } from "@/server/clock";
import { loadInsights } from "@/server/insights-service";
import { listLearningProfileInsights, refreshLearningProfile } from "@/server/learning-profile-service";
import { listMyGroups, loadBoard, refreshMyScores } from "@/server/study-group-service";
import { getWorkloadForecast } from "@/server/workload-forecast-service";

export const generateMetadata = () => createPageMetadata("insights");

export default async function InsightsPage() {
  const { user, timeZone } = await requireUserContext();
  const t = await getTranslations();

  const now = nowIso();

  const bundle = await loadInsights({ userId: user.id, nowIso: now, timeZone });

  /**
   * The forecast is fully deterministic (docs/PLAN.md's Workload Forecast
   * feature) and must render even when nothing else on this page can — but
   * it still reads real planning data, so a genuine failure (an unapplied
   * migration this session doesn't touch, a bad row) must hide only this
   * card rather than take the page down.
   */
  let forecasts: HorizonForecast[] = [];
  try {
    forecasts = await getWorkloadForecast({ userId: user.id, timeZone, nowIso: now });
  } catch (cause) {
    console.error("[insights] workload forecast unavailable:", cause);
  }

  /**
   * The learning profile is recomputed on every view, same "recompute when
   * looked at" pattern as the group scores below, and degrades the same way
   * as everything else here that depends on a migration this session's own
   * scope doesn't guarantee has been applied yet.
   */
  let learningInsights: LearningProfileInsightRow[] = [];
  let learningProfileAvailable = true;
  try {
    await refreshLearningProfile({ userId: user.id, timeZone, nowIso: now });
    learningInsights = await listLearningProfileInsights(user.id);
  } catch (cause) {
    console.error("[insights] learning profile unavailable:", cause);
    learningProfileAvailable = false;
  }
  const courseNameById = Object.fromEntries(bundle.courses.map((course) => [course.id, course.name]));

  /**
   * Groups are a secondary panel and must never take the page down with them.
   *
   * They also depend on a migration that may not have been applied yet, in
   * which case every query fails with "table not found". Statistics are the
   * point of this page and work regardless, so a group failure hides that
   * section rather than replacing the whole page with an error.
   */
  let groups: Awaited<ReturnType<typeof listMyGroups>> = [];
  let boards: Awaited<ReturnType<typeof loadBoard>>[] = [];
  let groupsAvailable = true;

  try {
    groups = await listMyGroups(user.id);

    // Scores are recomputed when the board is looked at. Good enough while this
    // is one student at a time; it moves to the cron in Session 11.
    if (groups.length > 0) await refreshMyScores();

    boards = await Promise.all(groups.map((group) => loadBoard(user.id, group.id, now)));
  } catch (cause) {
    console.error("[insights] study groups unavailable:", cause);
    groupsAvailable = false;
  }

  return (
    <div className="space-y-10">
      <PageHeader title={t("pages.insights.title")} description={t("pages.insights.description")} />

      <InsightsPanel insights={bundle.insights} daily={bundle.daily} courses={bundle.courses} />

      {forecasts.length > 0 ? <WorkloadForecastPanel forecasts={forecasts} /> : null}

      {learningProfileAvailable ? (
        <LearningProfilePanel insights={learningInsights} courseNameById={courseNameById} />
      ) : null}

      {groupsAvailable ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">{t("groups.title")}</h2>
            <p className="text-muted-foreground mt-1 max-w-prose text-sm">{t("groups.subtitle")}</p>
          </div>

          <GroupSetup hasGroups={groups.length > 0} />

          {boards
            .filter((board): board is NonNullable<typeof board> => board !== null)
            .map((board) => (
              <GroupBoard key={board.group.id} board={board} />
            ))}
        </section>
      ) : null}
    </div>
  );
}
