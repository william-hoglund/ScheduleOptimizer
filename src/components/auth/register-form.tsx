"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { AuthError } from "./auth-error";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { signUp } from "@/features/auth/actions";
import { useAuthValidationMessages } from "@/features/auth/use-auth-messages";
import {
  createRegisterSchema,
  type AuthErrorCode,
  type RegisterInput,
} from "@/lib/validation/auth";

export function RegisterForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const messages = useAuthValidationMessages();
  const [serverError, setServerError] = useState<AuthErrorCode | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(createRegisterSchema(messages)),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signUp({
        ...values,
        // Guessed from the browser so the student does not have to pick a
        // timezone during signup; they can change it in settings.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale,
      });

      if (result.ok) {
        if (result.needsConfirmation) {
          setSubmittedEmail(values.email);
          return;
        }
        // Already signed in: go straight to setup. Sending them to /dashboard
        // and letting the layout bounce them here shows a flash of the empty
        // dashboard first.
        router.push("/onboarding");
        router.refresh();
      } else {
        setServerError(result.code);
      }
    });
  });

  if (submittedEmail) {
    return (
      <div className="space-y-3 text-center">
        <div className="bg-muted text-muted-foreground mx-auto w-fit rounded-full p-3">
          <MailCheck className="size-5" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold">{t("register.checkEmailTitle")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("register.checkEmailBody", { email: submittedEmail })}
        </p>
        <p className="text-muted-foreground text-xs">{t("register.checkEmailHint")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <AuthError code={serverError} />

      <FormField
        label={t("fields.fullName")}
        autoComplete="name"
        autoFocus
        error={errors.fullName?.message}
        {...register("fullName")}
      />

      <FormField
        label={t("fields.email")}
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />

      <FormField
        label={t("fields.password")}
        type="password"
        autoComplete="new-password"
        hint={t("fields.passwordHint")}
        error={errors.password?.message}
        {...register("password")}
      />

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("register.pending") : t("register.submit")}
      </Button>
    </form>
  );
}
