"use client";

import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AuthErrorCode } from "@/lib/validation/auth";

/**
 * role="alert" so a screen reader announces the failure immediately — a
 * keyboard user who has just pressed Enter is not looking at the top of the form.
 */
export function AuthError({ code }: { code: AuthErrorCode | null }) {
  const t = useTranslations("auth.errors");

  if (!code) return null;

  return (
    <Alert variant="destructive" role="alert">
      <AlertCircle className="size-4" aria-hidden="true" />
      <AlertDescription>{t(code)}</AlertDescription>
    </Alert>
  );
}
