"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { StepNav } from "./step-nav";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { saveFirstDeadlineAndPlan, skipPlanStep } from "@/features/onboarding/actions";
import { useValidationText } from "@/features/shared/use-validation-text";

/**
 * The payoff step. Everything before this collected settings; this is the
 * first moment the product does the thing it exists to do. One deadline is
 * enough to generate a real plan from the Session 5 engine — the "done" step
 * that follows shows what it built.
 *
 * Skippable, like the institution/program step: a professional with nothing
 * due yet, or a student who wants to add everything properly from Deadlines
 * later, should not be forced through a form to get to their dashboard.
 */
export function StepPlan({ defaultDeadline }: { defaultDeadline: string }) {
  const t = useTranslations("onboarding");
  const message = useValidationText();
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await saveFirstDeadlineAndPlan({ title, deadlineLocal: deadline });
      if (!result.ok) setFormError(result.error);
    });
  }

  function onSkip() {
    setFormError(null);
    startTransition(async () => {
      const result = await skipPlanStep();
      if (!result.ok) setFormError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {formError ? (
        <p role="alert" className="text-destructive text-sm">
          {message(formError)}
        </p>
      ) : null}

      <FormField
        label={t("plan.fieldLabel")}
        placeholder={t("plan.fieldPlaceholder")}
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />

      <FormField
        label={t("plan.deadline")}
        type="date"
        value={deadline}
        onChange={(event) => setDeadline(event.target.value)}
      />

      <StepNav
        step={5}
        secondary={
          <Button type="button" variant="ghost" disabled={isPending} onClick={onSkip}>
            {t("skip")}
          </Button>
        }
      >
        <Button type="submit" disabled={isPending || title.trim().length === 0}>
          {isPending ? t("plan.generating") : t("plan.submit")}
        </Button>
      </StepNav>
    </form>
  );
}
