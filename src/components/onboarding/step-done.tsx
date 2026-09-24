"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { StepNav } from "./step-nav";
import { Button } from "@/components/ui/button";
import { completeOnboarding } from "@/features/onboarding/actions";
import { useValidationText } from "@/features/shared/use-validation-text";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2.5 last:border-b-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="max-w-[60%] text-right text-sm">{value}</span>
    </div>
  );
}

export function StepDone({
  name,
  courseCount,
  sessionSummary,
  daysSummary,
}: {
  name: string;
  courseCount: number;
  sessionSummary: string;
  daysSummary: string;
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

      <div className="bg-card rounded-lg border px-4 py-1">
        <SummaryRow label={t("done.profileSummary")} value={name} />
        <SummaryRow
          label={t("done.coursesSummary")}
          value={tCourses("countLabel", { count: courseCount })}
        />
        <SummaryRow label={t("done.preferencesSummary")} value={sessionSummary} />
        <SummaryRow label={tPreferences("daysSection")} value={daysSummary} />
      </div>

      <p className="text-muted-foreground flex items-start gap-2 text-sm">
        <Check className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t("done.nextUp")}
      </p>

      <StepNav step={5}>
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
