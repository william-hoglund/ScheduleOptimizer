"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { AuthError } from "./auth-error";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { updatePassword } from "@/features/auth/actions";
import { useAuthValidationMessages } from "@/features/auth/use-auth-messages";
import {
  createResetPasswordSchema,
  type AuthErrorCode,
  type ResetPasswordInput,
} from "@/lib/validation/auth";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const messages = useAuthValidationMessages();
  const [serverError, setServerError] = useState<AuthErrorCode | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(createResetPasswordSchema(messages)),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await updatePassword(values);
      if (result.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setServerError(result.code);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <AuthError code={serverError} />

      <FormField
        label={t("fields.newPassword")}
        type="password"
        autoComplete="new-password"
        autoFocus
        hint={t("fields.passwordHint")}
        error={errors.password?.message}
        {...register("password")}
      />

      <FormField
        label={t("fields.confirmPassword")}
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("reset.pending") : t("reset.submit")}
      </Button>
    </form>
  );
}
