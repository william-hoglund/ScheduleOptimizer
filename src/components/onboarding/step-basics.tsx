"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { StepNav } from "./step-nav";
import { FormField } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { TimezoneSelect } from "@/components/common/timezone-select";
import { Button } from "@/components/ui/button";
import { saveBasics } from "@/features/onboarding/actions";
import { useValidationText } from "@/features/shared/use-validation-text";
import { localeNames, locales } from "@/i18n/config";
import { SEGMENTS } from "@/lib/segments";
import { profileSchema, type ProfileInput } from "@/lib/validation/profile";

export function StepBasics({ defaults }: { defaults: ProfileInput }) {
  const t = useTranslations("onboarding");
  const message = useValidationText();
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveBasics(values);
      if (result.ok) return;

      if (result.fieldErrors) {
        for (const [field, code] of Object.entries(result.fieldErrors)) {
          setError(field as keyof ProfileInput, { message: code });
        }
      }
      setFormError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {formError ? (
        <p role="alert" className="text-destructive text-sm">
          {message(formError)}
        </p>
      ) : null}

      <FormField
        label={t("basics.name")}
        autoComplete="name"
        autoFocus
        error={message(errors.fullName?.message)}
        {...register("fullName")}
      />

      <TimezoneSelect
        label={t("basics.timezone")}
        hint={t("basics.timezoneHint")}
        error={message(errors.timezone?.message)}
        {...register("timezone")}
      />

      {/*
        Who the week belongs to. It changes defaults and wording rather than the
        engine — a professional gets shorter, later sessions and a work calendar
        that takes the day, because that is what their week actually looks like.
      */}
      <NativeSelect
        label={t("basics.segment")}
        hint={t("basics.segmentHint")}
        error={message(errors.segment?.message)}
        {...register("segment")}
      >
        {SEGMENTS.map((value) => (
          <option key={value} value={value}>
            {t(`basics.segments.${value}`)}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        label={t("basics.language")}
        error={message(errors.locale?.message)}
        {...register("locale")}
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {localeNames[code]}
          </option>
        ))}
      </NativeSelect>

      <StepNav step={1}>
        <Button type="submit" disabled={isPending}>
          {isPending ? t("saving") : t("continue")}
        </Button>
      </StepNav>
    </form>
  );
}
