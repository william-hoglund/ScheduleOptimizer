"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { AuthError } from "./auth-error";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { signIn } from "@/features/auth/actions";
import { useAuthValidationMessages } from "@/features/auth/use-auth-messages";
import { createLoginSchema, type AuthErrorCode, type LoginInput } from "@/lib/validation/auth";

export function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError: AuthErrorCode | null;
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const messages = useAuthValidationMessages();
  const [serverError, setServerError] = useState<AuthErrorCode | null>(initialError);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(createLoginSchema(messages)),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signIn(values);
      if (result.ok) {
        // typedRoutes cannot know this string at compile time. It is checked at
        // runtime on the server page to be a same-site path before reaching here.
        router.push(next as Route);
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
        label={t("fields.email")}
        type="email"
        autoComplete="email"
        autoFocus
        error={errors.email?.message}
        {...register("email")}
      />

      <div className="space-y-1.5">
        <FormField
          label={t("fields.password")}
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:text-foreground inline-block text-xs underline-offset-4 hover:underline"
        >
          {t("login.forgot")}
        </Link>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("login.pending") : t("login.submit")}
      </Button>
    </form>
  );
}
