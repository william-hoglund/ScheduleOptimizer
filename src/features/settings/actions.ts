"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/config";
import { actionFailed, actionOk, fromZodError, guarded, type ActionResult } from "@/lib/validation/action-result";
import { studyPreferencesSchema } from "@/lib/validation/preferences";
import { profileSchema } from "@/lib/validation/profile";
import { deleteAccount } from "@/server/account-service";
import { requireUser } from "@/server/auth";
import { saveStudyPreferences } from "@/server/preference-service";
import { updateProfile } from "@/server/profile-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

/**
 * Permanent. The confirmation this needs (typing the account's email) lives
 * in the client component — by the time this is called, the student has
 * already been told exactly what is about to happen.
 */
export async function deleteAccountAction(): Promise<ActionResult<undefined>> {
  await requireUser();

  const result = await deleteAccount();
  if (!result.ok) return actionFailed(result.error);

  // The account is gone; only the client's own session cookie remains to
  // clean up before sending them somewhere that isn't behind a login wall.
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();

  redirect("/");
}
