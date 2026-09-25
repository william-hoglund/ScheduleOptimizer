"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { explainPlanAction } from "@/features/ai-advisor/actions";
import type { PlanExplanation } from "@/lib/ai";

/**
 * Reads what the engine already decided, in words. Never re-derives times or
 * sessions — everything here is prose about facts `generate-plan.ts` already
 * produced, cached on `study_plans.explanation` after the first request.
 */
export function PlanExplanationCard({
  planId,
  initial,
}: {
  planId: string;
  initial: PlanExplanation | null;
}) {
  const t = useTranslations("planner");
  const [explanation, setExplanation] = useState(initial);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!explanation) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setErrorCode(null);
              const result = await explainPlanAction(planId);
              if (result.ok) setExplanation(result.data);
              else setErrorCode(result.error);
            })
          }
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          {isPending ? t("explain.generating") : t("explain.cta")}
        </Button>
        {errorCode ? (
          <p className="text-muted-foreground text-xs">
            {errorCode === "aiUnavailable" ? t("explain.unavailable") : t("explain.failed")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="bg-card space-y-2 rounded-lg border p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="text-primary size-3.5" aria-hidden="true" />
        {t("explain.title")}
      </h3>
      <p className="text-sm">{explanation.summary}</p>
      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
        {explanation.highlights.map((highlight, index) => (
          <li key={index}>{highlight}</li>
        ))}
      </ul>
      <p className="text-muted-foreground text-sm italic">{explanation.encouragement}</p>
    </div>
  );
}
