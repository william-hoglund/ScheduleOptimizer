"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { goToStep } from "@/features/onboarding/actions";

/**
 * The footer row on each onboarding step: an optional Back, and the primary
 * action supplied by the step itself.
 */
export function StepNav({
  step,
  children,
  secondary,
}: {
  step: number;
  children: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  const t = useTranslations("onboarding");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 pt-2">
      {step > 1 ? (
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() => startTransition(() => void goToStep(step - 1))}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("back")}
        </Button>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {secondary}
        {children}
      </div>
    </div>
  );
}
