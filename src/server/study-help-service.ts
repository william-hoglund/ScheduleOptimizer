import "server-only";

import type { Locale } from "@/i18n/config";
import {
  boundStudyMaterials,
  generateStudyHelp,
  isAiEnabled,
  type StudyHelp,
  type StudyMaterial,
} from "@/lib/ai";
import { DocumentTextExtractionError, extractDocumentText } from "@/lib/documents/extract-text";
import type { StudyHelpRequest } from "@/lib/validation/study-help";
import {
  downloadCourseDocumentBytes,
  getCourseDocument,
  listCourseDocuments,
  markDocumentCompleted,
  markDocumentFailed,
} from "./course-knowledge-service";
import { getCourse } from "./course-service";

/**
 * The Learn page's server side: read the chosen course documents and ask the
 * model to help the student study them.
 *
 * Text is extracted on demand each time rather than cached — a handful of
 * slide decks parses in well under a second, and it keeps "the material" as
 * exactly what is in storage, with nothing to fall out of sync. Worth caching
 * if a course library ever grows large enough for it to show.
 */

export type StudyHelpOutcome =
  | { ok: true; help: StudyHelp; truncated: boolean }
  | { ok: false; error: "aiUnavailable" | "notFound" | "noText" | "helpFailed" };

export async function generateStudyHelpForCourse({
  userId,
  locale,
  input,
}: {
  userId: string;
  locale: Locale;
  input: StudyHelpRequest;
}): Promise<StudyHelpOutcome> {
  if (!isAiEnabled()) return { ok: false, error: "aiUnavailable" };

  const course = await getCourse(userId, input.courseId);
  if (!course) return { ok: false, error: "notFound" };

  // Only documents that really belong to this course and this student — the
  // ids came from the browser.
  const wanted = new Set(input.documentIds);
  const documents = (await listCourseDocuments(userId, input.courseId)).filter((doc) => wanted.has(doc.id));
  if (documents.length === 0) return { ok: false, error: "notFound" };

  const materials: StudyMaterial[] = [];
  for (const document of documents) {
    try {
      const bytes = await downloadCourseDocumentBytes(userId, document);
      const { pages } = await extractDocumentText(bytes, document.mime_type);
      materials.push({ documentName: document.file_name, pages });
    } catch (cause) {
      // One unreadable file shouldn't sink the others.
      console.error("[study-help] could not read", document.id, cause);
    }
  }

  const bounded = boundStudyMaterials(materials);
  if (bounded.materials.length === 0) return { ok: false, error: "noText" };

  const help = await generateStudyHelp({
    locale,
    courseName: course.name,
    mode: input.mode,
    request: input.request,
    materials: bounded.materials,
  });
  if (!help) return { ok: false, error: "helpFailed" };

  return { ok: true, help, truncated: bounded.truncated };
}

/**
 * Lecture material skips syllabus extraction entirely; this just confirms the
 * file has readable text, so the documents list can say "Ready" or "Could not
 * read" honestly instead of leaving it "Not read yet" forever.
 */
export async function checkLearningMaterial(
  userId: string,
  documentId: string,
): Promise<{ ok: true } | { ok: false; error: "notFound" | "noText" }> {
  const document = await getCourseDocument(userId, documentId);
  if (!document) return { ok: false, error: "notFound" };

  try {
    const bytes = await downloadCourseDocumentBytes(userId, document);
    const { pages } = await extractDocumentText(bytes, document.mime_type);
    if (pages.every((page) => page.text.trim().length === 0)) {
      await markDocumentFailed(userId, documentId, "No extractable text found in the document");
      return { ok: false, error: "noText" };
    }
  } catch (cause) {
    const message = cause instanceof DocumentTextExtractionError ? cause.message : "Could not read the document";
    await markDocumentFailed(userId, documentId, message);
    return { ok: false, error: "noText" };
  }

  await markDocumentCompleted(userId, documentId);
  return { ok: true };
}
