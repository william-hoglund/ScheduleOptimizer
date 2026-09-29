"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { dismissLearningInsight, restoreLearningInsight } from "@/features/insights/actions";
import type { Json, LearningProfileInsightRow } from "@/lib/supabase/types";

/**
 * The Personal Learning Profile. Every sentence here describes observable
 * planning behavior, never a diagnosis — and every card names how much
 * evidence backs it, so a guess is never presented as a settled fact.
 * "Not accurate for me" is the override the brief asks for: dismissing an
 * insight *is* the correction (see `learning-profile-service.ts`).
 */

type BestStudyBandValue = { band: "morning" | "afternoon" | "evening" };
type EstimationBiasValue = { direction: "underestimates" | "overestimates" | "accurate"; ratioPercent: number };

function asBestStudyBand(value: Json): BestStudyBandValue {
  return value as unknown as BestStudyBandValue;
}
function asEstimationBias(value: Json): EstimationBiasValue {
  return value as unknown as EstimationBiasValue;
}

function InsightSentence({
  insight,
  courseNameById,
}: {
  insight: LearningProfileInsightRow;
  courseNameById: Record<string, string>;
}) {
  const t = useTranslations("learning");
  const tInsights = useTranslations("insights");

  if (insight.insight_type === "best_study_band") {
    const { band } = asBestStudyBand(insight.computed_value);
    return <>{t("bestStudyBand", { band: tInsights(`bands.${band}`) })}</>;
  }

  if (insight.insight_type === "estimation_bias") {
    const { direction, ratioPercent } = asEstimationBias(insight.computed_value);
    if (direction === "accurate") return <>{t("estimationBias.accurate")}</>;
    return <>{t(`estimationBias.${direction}`, { percent: ratioPercent })}</>;
  }

  // `computed_value` only ever holds `{ riskLevel: "elevated" }` today — the
  // course name is the only thing the sentence needs.
  const courseName = insight.course_id ? (courseNameById[insight.course_id] ?? "") : "";
  return <>{t("coursePostponementRisk", { courseName })}</>;
}

function InsightCaption({ insight }: { insight: LearningProfileInsightRow }) {
  const t = useTranslations("learning");
  const key = insight.insight_type === "estimation_bias" ? "basedOnTasks" : "basedOnSessions";
  return <>{t(key, { count: insight.observation_count })}</>;
}

function InsightCard({
  insight,
  courseNameById,
  dismissed,
}: {
  insight: LearningProfileInsightRow;
  courseNameById: Record<string, string>;
  dismissed: boolean;
}) {
  const t = useTranslations("learning");
  const [isPending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      if (dismissed) await restoreLearningInsight(insight.id);
      else await dismissLearningInsight(insight.id);
    });
  }

  return (
    <div className="bg-card space-y-2 rounded-lg border p-4">
      <p className="text-sm">
        <InsightSentence insight={insight} courseNameById={courseNameById} />
      </p>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          <InsightCaption insight={insight} />
        </p>
        <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={toggle}>
          {dismissed ? t("undo") : t("dismiss")}
        </Button>
      </div>
    </div>
  );
}

export function LearningProfilePanel({
  insights,
  courseNameById,
}: {
  insights: LearningProfileInsightRow[];
  courseNameById: Record<string, string>;
}) {
  const t = useTranslations("learning");
  const [showDismissed, setShowDismissed] = useState(false);

  if (insights.length === 0) {
    return (
      <section className="bg-card space-y-1 rounded-lg border p-4">
        <h2 className="label-caps text-foreground flex items-center gap-1.5">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("stillLearning")}</p>
      </section>
    );
  }

  const active = insights.filter((insight) => !insight.overridden_by_user);
  const dismissed = insights.filter((insight) => insight.overridden_by_user);

  return (
    <section className="space-y-3">
      <h2 className="label-caps text-foreground flex items-center gap-1.5">
        <Sparkles className="size-3.5" aria-hidden="true" />
        {t("title")}
      </h2>

      {active.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              courseNameById={courseNameById}
              dismissed={false}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("stillLearning")}</p>
      )}

      {dismissed.length > 0 ? (
        <div>
          <button
            type="button"
            className="text-muted-foreground text-xs underline underline-offset-2"
            onClick={() => setShowDismissed((value) => !value)}
          >
            {t("dismissedCount", { count: dismissed.length })}
          </button>

          {showDismissed ? (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {dismissed.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  courseNameById={courseNameById}
                  dismissed={true}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
