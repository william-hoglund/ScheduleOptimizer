"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { StudyPreferencesFields } from "@/components/preferences/study-preferences-fields";
import { Button } from "@/components/ui/button";
import { useValidationText } from "@/features/shared/use-validation-text";
import { updateStudyPreferences } from "@/features/settings/actions";
import { studyPreferencesSchema, type StudyPreferencesInput } from "@/lib/validation/preferences";

export function PreferencesForm({ defaults }: { defaults: StudyPreferencesInput }) {
  const t = useTranslations("settings");
  const message = useValidationText();
  const [formError, setFormError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<StudyPreferencesInput>({
    resolver: zodResolver(studyPreferencesSchema),
    defaultValues: defaults,
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    setJustSaved(false);
    startTransition(async () => {
      const result = await updateStudyPreferences(values);

      if (result.ok) {
        setJustSaved(true);
        form.reset(values);
        return;
      }
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
      <p className="text-muted-foreground max-w-prose text-sm">{t("preferencesIntro")}</p>

      {formError ? (
        <p role="alert" className="text-destructive text-sm">
          {message(formError)}
        </p>
      ) : null}

      <StudyPreferencesFields form={form} />

      <div className="flex items-center gap-3 border-t pt-5">
        <Button type="submit" disabled={isPending}>
          {isPending ? t("saving") : t("save")}
        </Button>
        {justSaved ? (
          <span className="text-success flex items-center gap-1.5 text-sm">
            <Check className="size-4" aria-hidden="true" />
            {t("saved")}
          </span>
        ) : null}
      </div>
    </form>
  );
}
