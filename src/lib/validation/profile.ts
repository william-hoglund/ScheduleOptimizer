import { z } from "zod";

import { locales } from "@/i18n/config";
import { SEGMENTS } from "@/lib/segments";
import { V } from "./messages";

/**
 * Checked against the browser's own IANA database rather than a hardcoded list,
 * so it stays correct as zones are added or renamed. Every planner calculation
 * depends on this value being real.
 */
function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const profileSchema = z.object({
  fullName: z.string().trim().min(1, V.required).max(120, V.nameTooLong),
  timezone: z.string().refine(isValidTimezone, V.invalidTimezone),
  locale: z.enum(locales),
  /** Student or working professional. Changes defaults and wording, not the engine. */
  segment: z.enum(SEGMENTS),
});

export type ProfileInput = z.infer<typeof profileSchema>;
