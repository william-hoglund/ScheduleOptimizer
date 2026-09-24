"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/config";
import { institutionSchema, programSchema } from "@/lib/validation/academic";
import { actionOk, fromZodError, guarded, type ActionResult } from "@/lib/validation/action-result";
import { studyPreferencesSchema } from "@/lib/validation/preferences";
import { profileSchema } from "@/lib/validation/profile";
import { createInstitution, createProgram } from "@/server/academic-service";
import { requireUser } from "@/server/auth";
import { saveStudyPreferences } from "@/server/preference-service";
import { updateProfile } from "@/server/profile-service";
import { LAST_STEP } from "./steps";

/**
 * Onboarding.
 *
 * Each step writes its own data AND advances `onboarding_step` in the same
 * action, so progress and data can never disagree.
 */

export async function saveBasics(input: unknown): Promise<ActionResult<undefined>> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(() =>
    updateProfile(user.id, {
      full_name: parsed.data.fullName,
      timezone: parsed.data.timezone,
      locale: parsed.data.locale,
      segment: parsed.data.segment,
      onboarding_step: 2,
    }),
  );
  if (!result.ok) return result;

  // Switch the interface immediately, rather than after the next full reload.
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
  return actionOk();
}

export async function saveStudies(input: {
  institutionName?: string;
  programName?: string;
}): Promise<ActionResult<undefined>> {
  const user = await requireUser();

  const institutionName = input.institutionName?.trim() ?? "";
  const programName = input.programName?.trim() ?? "";

  // Both are optional — plenty of students study without a formal program, and
  // forcing a value here would just produce junk data.
  if (institutionName) {
    const parsed = institutionSchema.safeParse({ name: institutionName, type: "university" });
    if (!parsed.success) return fromZodError(parsed.error);
  }
  if (programName) {
    const parsed = programSchema.safeParse({
      name: programName,
      institutionId: null,
      startDate: null,
      endDate: null,
      color: null,
    });
    if (!parsed.success) return fromZodError(parsed.error);
  }

  const result = await guarded(async () => {
    let institutionId: string | null = null;

    if (institutionName) {
      const institution = await createInstitution(user.id, {
        name: institutionName,
        type: "university",
      });
      institutionId = institution.id;
    }

    if (programName) {
      await createProgram(user.id, {
        name: programName,
        institutionId,
        startDate: null,
        endDate: null,
        color: null,
      });
    }

    await updateProfile(user.id, { onboarding_step: 3 });
  });
  if (!result.ok) return result;

  revalidatePath("/onboarding");
  return actionOk();
}

/** Courses are created through the normal course action; this just advances. */
export async function finishCoursesStep(): Promise<ActionResult<undefined>> {
  const user = await requireUser();

  const result = await guarded(() => updateProfile(user.id, { onboarding_step: 4 }));
  if (!result.ok) return result;

  revalidatePath("/onboarding");
  return actionOk();
}

export async function savePreferences(input: unknown): Promise<ActionResult<undefined>> {
  const user = await requireUser();

  const parsed = studyPreferencesSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(async () => {
    await saveStudyPreferences(user.id, parsed.data);
    await updateProfile(user.id, { onboarding_step: LAST_STEP });
  });
  if (!result.ok) return result;

  revalidatePath("/onboarding");
  return actionOk();
}

export async function completeOnboarding(): Promise<ActionResult<undefined>> {
  const user = await requireUser();

  const result = await guarded(() =>
    updateProfile(user.id, { onboarding_completed: true, onboarding_step: LAST_STEP }),
  );
  if (!result.ok) return result;

  revalidatePath("/", "layout");
  return actionOk();
}

/** Lets the student step back to change an earlier answer. */
export async function goToStep(step: number): Promise<ActionResult<undefined>> {
  const user = await requireUser();

  const clamped = Math.min(Math.max(Math.trunc(step), 1), LAST_STEP);
  const result = await guarded(() => updateProfile(user.id, { onboarding_step: clamped }));
  if (!result.ok) return result;

  revalidatePath("/onboarding");
  return actionOk();
}
