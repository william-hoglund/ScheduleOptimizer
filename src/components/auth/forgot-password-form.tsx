"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { AuthError } from "./auth-error";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "@/features/auth/actions";
import { useAuthValidationMessages } from "@/features/auth/use-auth-messages";
import {
  createForgotPasswordSchema,
  type AuthErrorCode,
  type ForgotPasswordInput,
} from "@/lib/validation/auth";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const messages = useAuthValidationMessages();
  const [serverError, setServerError] = useState<AuthErrorCode | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(createForgotPasswordSchema(messages)),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (result.ok) {
        // Shown whether or not the address exists, so this form cannot be used
        // to discover who has an account here.
        setSentTo(values.email);
      } else {
        setServerError(result.code);
      }
    });
  });

  if (sentTo) {
    return (
      <div className="space-y-3 text-center">
        <div className="bg-muted text-muted-foreground mx-auto w-fit rounded-full p-3">
          <MailCheck className="size-5" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold">{t("forgot.sentTitle")}</h2>
        <p className="text-muted-foreground text-sm">{t("forgot.sentBody", { email: sentTo })}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <AuthError code={serverError} />

      <FormField
        label={t("fields.email")}
        type="email"
        autoComplete="email"
        autoFocus
        error={errors.email?.message}
        {...register("email")}
      />

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("forgot.pending") : t("forgot.submit")}
      </Button>
    </form>
  );
}
