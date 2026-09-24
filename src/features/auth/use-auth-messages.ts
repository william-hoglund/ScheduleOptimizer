"use client";

import { useTranslations } from "next-intl";

import type { AuthValidationMessages } from "@/lib/validation/auth";

/** Validation text in the student's language, for the Zod schema factories. */
export function useAuthValidationMessages(): AuthValidationMessages {
  const t = useTranslations("auth.validation");

  return {
    emailInvalid: t("emailInvalid"),
    passwordTooShort: t("passwordTooShort"),
    passwordsDoNotMatch: t("passwordsDoNotMatch"),
    nameRequired: t("nameRequired"),
  };
}
