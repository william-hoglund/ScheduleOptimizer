import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { createPageMetadata } from "@/components/layout/placeholder-page";
import { PlanExplanationCard } from "@/components/planner/plan-explanation";
import { PlannerSetupForm } from "@/components/planner/planner-setup-form";
import { PlanPreview } from "@/components/planner/plan-preview";
import { PlanWarnings } from "@/components/planner/plan-warnings";
import { AdvisorPanel } from "@/features/ai-advisor/advisor-panel";
import { isAiEnabled } from "@/lib/ai";
import { utcToLocalDate } from "@/lib/calendar/time";
import type { FeasibilityReport, PlannerInput, PlannerWarning } from "@/lib/planner/types";
import type { PlanExplanation } from "@/lib/ai";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireUserContext } from "@/server/auth";
import { listCalendarEvents } from "@/server/calendar-service";
import { nowIso } from "@/server/clock";
import { listCourses } from "@/server/course-service";
import { getDraftPlan } from "@/server/planner-service";
import { listTasks } from "@/server/task-service";
import { PlanNotesSummary } from "@/components/planner/plan-notes-summary";

export const generateMetadata = () => createPageMetadata("planner");

function safeParseExplanation(raw: string): PlanExplanation | null {
  try {
    return JSON.parse(raw) as PlanExplanation;
  } catch {
    // A cached explanation we cannot read is not worth breaking the page over
    // — the "Explain this plan" button below will simply regenerate it.
    return null;
  }
}

/** The newest draft, which is what the student is currently reviewing. */
async function findLatestDraft(userId: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("study_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

/**
 * The most recent run's feasibility and warnings.
 *
 * Read back from `planner_runs` rather than recomputed, so what the student
 * sees is exactly what the engine produced for this draft.
 */
async function loadRunDetails(
  userId: string,
  planId: string,
): Promise<{
  warnings: PlannerWarning[];
  feasibility: FeasibilityReport | null;
  coveragePercent: number;
  planNotes: PlannerInput["planNotes"] | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("planner_runs")
    .select("result_snapshot, warnings, input_snapshot")
    .eq("user_id", userId)
    .eq("study_plan_id", planId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { warnings: [], feasibility: null, coveragePercent: 0, planNotes: null };

  const snapshot = data.result_snapshot as {
    feasibility?: FeasibilityReport;
    warnings?: PlannerWarning[];
    quality?: { coverage?: number };
  } | null;

  return {
    warnings: snapshot?.warnings ?? [],
    feasibility: snapshot?.feasibility ?? null,
    coveragePercent: Math.round((snapshot?.quality?.coverage ?? 0) * 100),
    planNotes: (data.input_snapshot as Pick<PlannerInput, "planNotes"> | null)?.planNotes ?? null,
  };
}

export default async function PlannerPage() {
  const { user, timeZone } = await requireUserContext();
  const t = await getTranslations();

  const today = utcToLocalDate(nowIso(), timeZone);
  const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [courses, tasks, draftId] = await Promise.all([
    listCourses(user.id),
    listTasks(user.id, { includeCompleted: false }),
    findLatestDraft(user.id),
  ]);

  const draft = draftId ? await getDraftPlan(user.id, draftId) : null;
  const run = draftId ? await loadRunDetails(user.id, draftId) : null;

  // The whole point of the plan is a schedule that combines proposed study
  // time with what is already fixed — lectures, tutorials, anything else on
  // the calendar — so the preview's calendar view needs both, not just the
  // sessions this run proposed.
  const fixedEvents = draft
    ? await listCalendarEvents(
        user.id,
        `${draft.plan.start_date}T00:00:00.000Z`,
        `${draft.plan.end_date}T23:59:59.999Z`,
      )
    : [];

  const taskTitles = new Map(tasks.map((task) => [task.id, task.title]));

  const cachedExplanation: PlanExplanation | null = draft?.plan.explanation
    ? safeParseExplanation(draft.plan.explanation)
    : null;

  const totalMinutes = draft?.sessions.reduce((sum, s) => sum + s.planned_minutes, 0) ?? 0;
  const dayCount = new Set(draft?.sessions.map((s) => utcToLocalDate(s.start_at, timeZone)) ?? [])
    .size;

  return (
    <div className="space-y-8">
      <PageHeader title={t("pages.planner.title")} description={t("pages.planner.description")} />

      <PlannerSetupForm courses={courses} today={today} defaultStart={today} defaultEnd={weekEnd} />

      {isAiEnabled() ? (
        <section className="bg-card space-y-3 rounded-xl border p-5">
          <div>
            <h2 className="text-sm font-semibold">{t("pages.advisor.title")}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{t("pages.advisor.description")}</p>
          </div>
          <AdvisorPanel />
        </section>
      ) : null}

      {run && run.warnings.length > 0 && run.feasibility ? (
        <PlanWarnings
          warnings={run.warnings}
          feasibility={run.feasibility}
          taskTitles={taskTitles}
        />
      ) : null}

      {draft ? (
        <div className="space-y-6">
          {isAiEnabled() ? (
            <PlanExplanationCard planId={draft.plan.id} initial={cachedExplanation} />
          ) : null}

          {run?.planNotes ? <PlanNotesSummary notes={run.planNotes} /> : null}

          <PlanPreview
            planId={draft.plan.id}
            sessions={draft.sessions}
            fixedEvents={fixedEvents}
            courses={courses}
            timeZone={timeZone}
            runOptions={{
              startDate: draft.plan.start_date,
              endDate: draft.plan.end_date,
              courseIds: [],
              overrides: {},
              // So "another option" honours the same note.
              notes: run?.planNotes?.text,
            }}
            summary={{
              totalMinutes,
              dayCount,
              coveragePercent: run?.coveragePercent ?? 0,
            }}
          />
        </div>
      ) : (
        <EmptyState
          icon={Sparkles}
          title={t("planner.preview.noPlanTitle")}
          description={t("planner.preview.noPlanBody")}
        />
      )}
    </div>
  );
}
