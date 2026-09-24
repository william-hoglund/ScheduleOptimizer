"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { StepNav } from "./step-nav";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { saveStudies } from "@/features/onboarding/actions";
import { useValidationText } from "@/features/shared/use-validation-text";

/**
 * Both fields are optional. Plenty of students take standalone courses with no
 * program attached, and requiring a value here would only produce junk rows.
 */
export function StepStudies() {
  const t = useTranslations("onboarding");
  const message = useValidationText();
  const [institution, setInstitution] = useState("");
  const [program, setProgram] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(values: { institutionName: string; programName: string }) {
    setFormError(null);
    startTransition(async () => {
      const result = await saveStudies(values);
      if (!result.ok) setFormError(result.error);
    });
  }

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit({ institutionName: institution, programName: program });
      }}
    >
      {formError ? (
        <p role="alert" className="text-destructive text-sm">
          {message(formError)}
        </p>
      ) : null}

      <FormField
        label={t("studies.institution")}
        placeholder={t("studies.institutionPlaceholder")}
        hint={t("optional")}
        autoFocus
        value={institution}
        onChange={(event) => setInstitution(event.target.value)}
      />

      <FormField
        label={t("studies.program")}
        placeholder={t("studies.programPlaceholder")}
        hint={t("optional")}
        value={program}
        onChange={(event) => setProgram(event.target.value)}
      />

      <StepNav
        step={2}
        secondary={
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => submit({ institutionName: "", programName: "" })}
          >
            {t("skip")}
          </Button>
        }
      >
        <Button type="submit" disabled={isPending}>
          {isPending ? t("saving") : t("continue")}
        </Button>
      </StepNav>
    </form>
  );
}
