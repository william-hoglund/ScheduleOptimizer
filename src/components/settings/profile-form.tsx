"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { TimezoneSelect } from "@/components/common/timezone-select";
import { Button } from "@/components/ui/button";
import { useValidationText } from "@/features/shared/use-validation-text";
import { updateProfileSettings } from "@/features/settings/actions";
import { localeNames, locales } from "@/i18n/config";
import { SEGMENTS } from "@/lib/segments";
import { profileSchema, type ProfileInput } from "@/lib/validation/profile";

export function ProfileForm({ defaults, email }: { defaults: ProfileInput; email: string }) {
  const t = useTranslations("settings");
  const tOnboarding = useTranslations("onboarding");
  const message = useValidationText();
  const [formError, setFormError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    setJustSaved(false);
    startTransition(async () => {
      const result = await updateProfileSettings(values);

      if (result.ok) {
        // Re-baseline the form on the saved values, so the button goes back to
        // disabled and the confirmation can show.
        reset(values);
        setJustSaved(true);
        return;
      }
      if (result.fieldErrors) {
        for (const [field, code] of Object.entries(result.fieldErrors)) {
          setError(field as keyof ProfileInput, { message: code });
        }
      }
      setFormError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-5" noValidate>
      {formError ? (
        <p role="alert" className="text-destructive text-sm">
          {message(formError)}
        </p>
      ) : null}

      <FormField
        label={tOnboarding("basics.name")}
        autoComplete="name"
        error={message(errors.fullName?.message)}
        {...register("fullName")}
      />

      {/* Read-only: changing the sign-in address needs a confirmation flow on
          both the old and new mailbox, which is not built yet. */}
      <FormField
        label={t("profile.email")}
        value={email}
        hint={t("profile.emailHint")}
        readOnly
        disabled
      />

      <TimezoneSelect
        label={tOnboarding("basics.timezone")}
        error={message(errors.timezone?.message)}
        {...register("timezone")}
      />


      {/*
        Who the week belongs to. It changes defaults and wording rather than the
        engine — a professional gets shorter, later sessions and a work calendar
        that takes the day, because that is what their week actually looks like.
      */}
      <NativeSelect
        label={tOnboarding("basics.segment")}
        hint={tOnboarding("basics.segmentHint")}
        error={message(errors.segment?.message)}
        {...register("segment")}
      >
        {SEGMENTS.map((value) => (
          <option key={value} value={value}>
            {tOnboarding(`basics.segments.${value}`)}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        label={tOnboarding("basics.language")}
        error={message(errors.locale?.message)}
        {...register("locale")}
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {localeNames[code]}
          </option>
        ))}
      </NativeSelect>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending || !isDirty}>
          {isPending ? t("saving") : t("save")}
        </Button>
        {justSaved && !isDirty ? (
          <span className="text-success flex items-center gap-1.5 text-sm">
            <Check className="size-4" aria-hidden="true" />
            {t("saved")}
          </span>
        ) : null}
      </div>
    </form>
  );
}
