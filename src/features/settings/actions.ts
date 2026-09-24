"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/config";
import { actionOk, fromZodError, guarded, type ActionResult } from "@/lib/validation/action-result";
import { studyPreferencesSchema } from "@/lib/validation/preferences";
import { profileSchema } from "@/lib/validation/profile";
import { requireUser } from "@/server/auth";
import { saveStudyPreferences } from "@/server/preference-service";
import { updateProfile } from "@/server/profile-service";

export async function updateProfileSettings(input: unknown): Promise<ActionResult<undefined>> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(() =>
    updateProfile(user.id, {
      full_name: parsed.data.fullName,
      timezone: parsed.data.timezone,
      locale: parsed.data.locale,
      segment: parsed.data.segment,
    }),
  );
  if (!result.ok) return result;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
  return actionOk();
}

export async function updateStudyPreferences(input: unknown): Promise<ActionResult<undefined>> {
  const user = await requireUser();

  const parsed = studyPreferencesSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(() => saveStudyPreferences(user.id, parsed.data));
  if (!result.ok) return result;

  revalidatePath("/settings");
  revalidatePath("/planner");
  return actionOk();
}
