"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { StepNav } from "./step-nav";
import { StudyPreferencesFields } from "@/components/preferences/study-preferences-fields";
import { Button } from "@/components/ui/button";
import { savePreferences } from "@/features/onboarding/actions";
import { useValidationText } from "@/features/shared/use-validation-text";
import { studyPreferencesSchema, type StudyPreferencesInput } from "@/lib/validation/preferences";

export function StepPreferences({ defaults }: { defaults: StudyPreferencesInput }) {
  const t = useTranslations("onboarding");
  const message = useValidationText();
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<StudyPreferencesInput>({
    resolver: zodResolver(studyPreferencesSchema),
    defaultValues: defaults,
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await savePreferences(values);
      if (result.ok) return;

      if (result.fieldErrors) {
        for (const [field, code] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof StudyPreferencesInput, { message: code });
        }
      }
      setFormError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {formError ? (
        <p role="alert" className="text-destructive text-sm">
          {message(formError)}
        </p>
      ) : null}

      <StudyPreferencesFields form={form} />

      <StepNav step={4}>
        <Button type="submit" disabled={isPending}>
          {isPending ? t("saving") : t("continue")}
        </Button>
      </StepNav>
    </form>
  );
}
