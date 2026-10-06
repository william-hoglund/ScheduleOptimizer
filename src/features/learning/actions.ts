"use server";

import { revalidatePath } from "next/cache";

import { defaultLocale, isLocale } from "@/i18n/config";
import { actionFailed, actionOk, fromZodError, type ActionResult } from "@/lib/validation/action-result";
import { studyHelpRequestSchema } from "@/lib/validation/study-help";
import { requireUserContext } from "@/server/auth";
import { getCourseDocument } from "@/server/course-knowledge-service";
import { getProfile } from "@/server/profile-service";
import { checkLearningMaterial, generateStudyHelpForCourse } from "@/server/study-help-service";
import type { StudyHelp } from "@/lib/ai";

/** The Learn page: help studying a course's own lecture material. */

export async function askStudyHelper(
  input: unknown,
): Promise<ActionResult<{ help: StudyHelp; truncated: boolean }>> {
  const { user } = await requireUserContext();
  const parsed = studyHelpRequestSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const profile = await getProfile(user.id);
  const locale = profile?.locale && isLocale(profile.locale) ? profile.locale : defaultLocale;

  const outcome = await generateStudyHelpForCourse({ userId: user.id, locale, input: parsed.data });
  if (!outcome.ok) return actionFailed(outcome.error);
  return actionOk({ help: outcome.help, truncated: outcome.truncated });
}

/** Called right after a lecture-material upload, in place of syllabus extraction. */
export async function finishLearningMaterialUpload(
  documentId: string,
  options: { autoTitle?: "pasted" | "file" } = {},
): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();
  const document = await getCourseDocument(user.id, documentId);
  if (!document) return actionFailed("notFound");

  const profile = await getProfile(user.id);
  const locale = profile?.locale && isLocale(profile.locale) ? profile.locale : defaultLocale;
  const result = await checkLearningMaterial(user.id, documentId, { autoTitle: options.autoTitle === "pasted" || options.autoTitle === "file" ? options.autoTitle : null, locale });
  // "layout" so the Learn page under this course refreshes its material list too.
  revalidatePath(`/courses/${document.course_id}`, "layout");
  if (!result.ok) return actionFailed(result.error);
  return actionOk();
}
