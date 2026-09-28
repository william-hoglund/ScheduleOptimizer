"use client";

import { Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { StepNav } from "./step-nav";
import { Button } from "@/components/ui/button";
import { completeOnboarding } from "@/features/onboarding/actions";
import { useValidationText } from "@/features/shared/use-validation-text";
import { cn } from "@/lib/utils";

/**
 * Each row enters with a short stagger — the delay is what makes this read
 * as a reveal rather than a table that was simply always there.
 */
function SummaryRow({
  label,
  value,
  index,
  emphasize,
}: {
  label: string;
  value: string;
  index: number;
  /** The plan row: the one thing this whole flow exists to produce. */
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 flex items-start justify-between gap-4 border-b py-2.5 duration-500 fill-mode-both last:border-b-0",
        emphasize && "border-primary/20 bg-primary/5 -mx-4 rounded-md border-b-0 px-4",
      )}
      style={{ animationDelay: `${100 + index * 90}ms` }}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 text-xs",
          emphasize ? "text-foreground font-medium" : "text-muted-foreground",
        )}
      >
        {emphasize ? <Sparkles className="text-primary size-3.5 shrink-0" aria-hidden="true" /> : null}
        {label}
      </span>
      <span className={cn("max-w-[60%] text-right text-sm", emphasize && "font-medium")}>
        {value}
      </span>
    </div>
  );
}

export function StepDone({
  name,
  courseCount,
  sessionSummary,
  daysSummary,
  planSummary,
}: {
  name: string;
  courseCount: number;
  sessionSummary: string;
  daysSummary: string;
  /** Null when the plan step was skipped, or generation didn't produce anything to show. */
  planSummary: string | null;
}) {
  const t = useTranslations("onboarding");
  const tCourses = useTranslations("courses");
  const tPreferences = useTranslations("preferences");
  const message = useValidationText();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-5">
      {formError ? (
        <p role="alert" className="text-destructive text-sm">
          {message(formError)}
        </p>
      ) : null}

      <div className="bg-card animate-in fade-in zoom-in-95 rounded-lg border px-4 py-1 duration-500">
        <SummaryRow index={0} label={t("done.profileSummary")} value={name} />
        <SummaryRow
          index={1}
          label={t("done.coursesSummary")}
          value={tCourses("countLabel", { count: courseCount })}
        />
        <SummaryRow index={2} label={t("done.preferencesSummary")} value={sessionSummary} />
        <SummaryRow index={3} label={tPreferences("daysSection")} value={daysSummary} />
        {planSummary ? (
          <SummaryRow index={4} emphasize label={t("done.planLabel")} value={planSummary} />
        ) : null}
      </div>

      <p
        className="text-muted-foreground animate-in fade-in slide-in-from-bottom-1 flex items-start gap-2 text-sm duration-500 fill-mode-both"
        style={{ animationDelay: `${100 + (planSummary ? 5 : 4) * 90}ms` }}
      >
        <Check className="text-success animate-in zoom-in mt-0.5 size-4 shrink-0 duration-300" aria-hidden="true" />
        {planSummary ? t("done.nextUpWithPlan") : t("done.nextUp")}
      </p>

      <StepNav step={6}>
        <Button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await completeOnboarding();
              if (result.ok) {
                router.push("/dashboard");
                router.refresh();
              } else {
                setFormError(result.error);
              }
            })
          }
        >
          {isPending ? t("saving") : t("done.finish")}
        </Button>
      </StepNav>
    </div>
  );
}
