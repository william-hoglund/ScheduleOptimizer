"use client";

import { useTranslations } from "next-intl";

import { V } from "@/lib/validation/messages";

const KNOWN_CODES = new Set<string>([...Object.values(V), "invalidInput", "unexpected"]);

/**
 * Turns a validation code from a schema or server action into text in the
 * student's language.
 *
 * Anything unrecognised is passed through unchanged rather than swallowed, so a
 * missing translation shows up as an obvious code instead of silently blank.
 */
export function useValidationText() {
  const t = useTranslations("validation");

  return (code: string | undefined): string | undefined => {
    if (!code) return undefined;
    return KNOWN_CODES.has(code) ? t(code as Parameters<typeof t>[0]) : code;
  };
}
