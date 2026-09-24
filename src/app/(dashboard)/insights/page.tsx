import { getTranslations } from "next-intl/server";

import { GroupBoard } from "@/components/groups/group-board";
import { GroupSetup } from "@/components/groups/group-setup";
import { InsightsPanel } from "@/components/insights/insights-panel";
import { PageHeader } from "@/components/layout/page-header";
import { createPageMetadata } from "@/components/layout/placeholder-page";
import { requireUserContext } from "@/server/auth";
import { nowIso } from "@/server/clock";
import { loadInsights } from "@/server/insights-service";
import { listMyGroups, loadBoard, refreshMyScores } from "@/server/study-group-service";

export const generateMetadata = () => createPageMetadata("insights");

export default async function InsightsPage() {
  const { user, timeZone } = await requireUserContext();
  const t = await getTranslations();

  const now = nowIso();

  const bundle = await loadInsights({ userId: user.id, nowIso: now, timeZone });

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
