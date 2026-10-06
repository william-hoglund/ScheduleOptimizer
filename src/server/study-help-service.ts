import "server-only";

import type { Locale } from "@/i18n/config";
import {
  boundStudyMaterials,
  generateStudyHelp,
  isAiEnabled,
  titleMaterial,
  type StudyHelp,
  type StudyMaterial,
} from "@/lib/ai";
import { DocumentTextExtractionError, extractDocumentText } from "@/lib/documents/extract-text";
import type { StudyHelpRequest } from "@/lib/validation/study-help";
import {
  downloadCourseDocumentBytes,
  getCourseDocument,
  listCourseDocuments,
  listCourseMilestones,
  markDocumentCompleted,
  markDocumentFailed,
  renameCourseDocument,
} from "./course-knowledge-service";
import { getCourse } from "./course-service";
import { listTasks } from "./task-service";
import { fallbackMaterialTitle } from "@/lib/ai/prompts/material-title";
import type { CourseDocumentRow } from "@/lib/supabase/types";

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
  {
    autoTitle = null,
    locale = "en",
  }: {
    /** "pasted": placeholder name, always replaced. "file": the file's own name is a hint and the no-AI fallback. */
    autoTitle?: "pasted" | "file" | null;
    locale?: Locale;
  } = {},
): Promise<{ ok: true } | { ok: false; error: "notFound" | "noText" }> {
  const document = await getCourseDocument(userId, documentId);
  if (!document) return { ok: false, error: "notFound" };

  try {
    const bytes = await downloadCourseDocumentBytes(userId, document);
    const { pages, fullText } = await extractDocumentText(bytes, document.mime_type);
    if (pages.every((page) => page.text.trim().length === 0)) {
      await markDocumentFailed(userId, documentId, "No extractable text found in the document");
      return { ok: false, error: "noText" };
    }
    if (autoTitle) await autoTitleMaterial(userId, document, fullText, locale, autoTitle);
  } catch (cause) {
    const message = cause instanceof DocumentTextExtractionError ? cause.message : "Could not read the document";
    await markDocumentFailed(userId, documentId, message);
    return { ok: false, error: "noText" };
  }

  await markDocumentCompleted(userId, documentId);
  return { ok: true };
}

/**
 * Names untitled material by what it is: AI matches it against the course
 * outline when it can, otherwise the text's own first line is used. A naming
 * failure never fails the upload — the placeholder name simply stays.
 */
async function autoTitleMaterial(
  userId: string,
  document: CourseDocumentRow,
  text: string,
  locale: Locale,
  kind: "pasted" | "file",
) {
  try {
    let title: string | null = null;

    if (isAiEnabled()) {
      const [course, milestones, tasks, documents] = await Promise.all([
        getCourse(userId, document.course_id),
        listCourseMilestones(userId, document.course_id).catch(() => []),
        listTasks(userId, { includeCompleted: true }),
        listCourseDocuments(userId, document.course_id),
      ]);
      title = await titleMaterial({
        locale,
        courseName: course?.name ?? "",
        outline: [
          ...milestones.map((m) => `- ${m.milestone_date ?? ""} ${m.title}`.trim()),
          ...tasks.filter((t) => t.course_id === document.course_id).map((t) => `- Assessment: ${t.title}`),
        ].slice(0, 40),
        existingNames: documents.filter((d) => d.id !== document.id).map((d) => d.file_name).slice(0, 20),
        text,
        originalName: kind === "file" ? document.file_name : undefined,
      });
    }

    // A file keeps its own name when AI can't do better; pasted text has none.
    if (kind === "pasted") title ??= fallbackMaterialTitle(text);
    if (title) await renameCourseDocument(userId, document.id, title.replace(/[\\/]/g, "–"));
  } catch (cause) {
    console.error("[study-help] could not title material", document.id, cause);
  }
}
