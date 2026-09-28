"use server";

import { revalidatePath } from "next/cache";

import { defaultLocale, isLocale } from "@/i18n/config";
import type { CourseExtraction } from "@/lib/ai";
import {
  actionFailed,
  actionOk,
  fromZodError,
  guarded,
  type ActionResult,
} from "@/lib/validation/action-result";
import { confirmExtractionSchema, documentUploadSchema } from "@/lib/validation/course-knowledge";
import { requireUserContext } from "@/server/auth";
import { generateCourseExtraction } from "@/server/ai-service";
import {
  createCourseDocument,
  deleteCourseDocument,
  getCourseDocument,
  saveExtractionSelections,
  type SaveExtractionOutcome,
} from "@/server/course-knowledge-service";
import { getProfile } from "@/server/profile-service";
import type { CourseDocumentRow } from "@/lib/supabase/types";

/**
 * Course document upload and extraction (docs/PLAN.md §40).
 *
 * Same preview-then-confirm shape as `.ics` import: `previewExtraction`
 * proposes structured facts, nothing is written, and only
 * `confirmExtraction` — re-validating everything the browser sends back —
 * actually saves rows.
 *
 * The file itself is uploaded directly from the browser to Supabase Storage
 * (see `components/courses/document-upload-panel.tsx`), not through a Server
 * Action: Server Actions carry a small default body limit, which a multi-MB
 * PDF would exceed. This action only ever receives the resulting storage
 * path and small JSON payloads.
 */

export async function recordCourseDocument(input: unknown): Promise<ActionResult<CourseDocumentRow>> {
  const { user } = await requireUserContext();

  const parsed = documentUploadSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  // The path must sit inside this user's own storage folder — the same shape
  // the storage RLS policy enforces, checked again here so a forged path is
  // rejected before it is even attempted against the database.
  if (!parsed.data.storagePath.startsWith(`${user.id}/`)) {
    return actionFailed("invalidInput");
  }

  const result = await guarded(() => createCourseDocument(user.id, parsed.data));
  if (!result.ok) return result;

  revalidatePath(`/courses/${parsed.data.courseId}`);
  return result;
}

export type ExtractionPreview = {
  documentId: string;
  extraction: CourseExtraction;
};

export async function previewExtraction(documentId: string): Promise<ActionResult<ExtractionPreview>> {
  const { user } = await requireUserContext();
  const profile = await getProfile(user.id);
  const locale = profile?.locale && isLocale(profile.locale) ? profile.locale : defaultLocale;

  const outcome = await generateCourseExtraction({ userId: user.id, documentId, locale });
  if (!outcome.ok) return actionFailed(outcome.error);

  return actionOk({ documentId, extraction: outcome.extraction });
}

export async function confirmExtraction(input: unknown): Promise<ActionResult<SaveExtractionOutcome>> {
  const { user, timeZone } = await requireUserContext();

  const parsed = confirmExtractionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const document = await getCourseDocument(user.id, parsed.data.documentId);
  if (!document) return actionFailed("notFound");

  const result = await guarded(() => saveExtractionSelections(user.id, timeZone, parsed.data));
  if (!result.ok) return result;

  revalidatePath(`/courses/${document.course_id}`);
  revalidatePath("/deadlines");
  revalidatePath("/calendar");
  return result;
}

export async function removeCourseDocument(documentId: string): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const document = await getCourseDocument(user.id, documentId);
  if (!document) return actionFailed("notFound");

  const result = await guarded(() => deleteCourseDocument(user.id, document));
  if (!result.ok) return result;

  revalidatePath(`/courses/${document.course_id}`);
  return actionOk();
}
