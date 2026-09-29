import "server-only";

import { defaultTaskInput } from "@/lib/validation/task";
import { resolveMinutes } from "@/lib/tasks/task-kinds";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  AssessmentDetailRow,
  CourseDocumentRow,
  CourseMilestoneRow,
  CourseRequirementRow,
  DocumentProcessingStatus,
} from "@/lib/supabase/types";
import type { ConfirmExtractionInput, DocumentUploadInput } from "@/lib/validation/course-knowledge";
import { nowIso } from "./clock";
import { createTask } from "./task-service";

/**
 * Course documents, and the structured facts extracted from them
 * (docs/PLAN.md §40). The only place `course_documents`, `course_requirements`,
 * `assessment_details` and `course_milestones` are read or written.
 *
 * `saveExtractionSelections` is the one function that turns a reviewed
 * extraction into real rows, and it deliberately calls `createTask` — the
 * same function the ordinary task form uses — rather than inserting into
 * `tasks` directly. Same principle as the advisor in `lib/ai/resolve-command.ts`:
 * the model (or here, the extraction it proposed) never gets a write path of
 * its own, it only ever drives an existing, already-tested one.
 */

const BUCKET = "course-documents";

// ---------------------------------------------------------------- documents ---

export async function createCourseDocument(
  userId: string,
  input: DocumentUploadInput,
): Promise<CourseDocumentRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("course_documents")
    .insert({
      user_id: userId,
      course_id: input.courseId,
      file_name: input.fileName,
      file_size: input.fileSize,
      mime_type: input.mimeType,
      storage_path: input.storagePath,
      document_type: input.documentType,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Could not save course document: ${error.message}`);
  return data;
}

export async function listCourseDocuments(userId: string, courseId: string): Promise<CourseDocumentRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("course_documents")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .order("uploaded_at", { ascending: false });

  if (error) throw new Error(`Could not load course documents: ${error.message}`);
  return data ?? [];
}

export async function getCourseDocument(
  userId: string,
  documentId: string,
): Promise<CourseDocumentRow | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("course_documents")
    .select("*")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load course document: ${error.message}`);
  return data;
}

/** The original file, for re-reading during extraction — never discarded, per §40.1. */
export async function downloadCourseDocumentBytes(
  userId: string,
  document: CourseDocumentRow,
): Promise<Uint8Array> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.storage.from(BUCKET).download(document.storage_path);
  if (error || !data) {
    throw new Error(`Could not download course document: ${error?.message ?? "empty response"}`);
  }

  return new Uint8Array(await data.arrayBuffer());
}

async function setDocumentStatus(
  userId: string,
  documentId: string,
  status: DocumentProcessingStatus,
  processingError: string | null,
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("course_documents")
    .update({
      processing_status: status,
      processing_error: processingError,
      ...(status === "completed" || status === "failed" ? { processed_at: nowIso() } : {}),
    })
    .eq("id", documentId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not update course document status: ${error.message}`);
}

export const markDocumentProcessing = (userId: string, documentId: string) =>
  setDocumentStatus(userId, documentId, "processing", null);
export const markDocumentCompleted = (userId: string, documentId: string) =>
  setDocumentStatus(userId, documentId, "completed", null);
export const markDocumentFailed = (userId: string, documentId: string, message: string) =>
  setDocumentStatus(userId, documentId, "failed", message.slice(0, 500));

/** Removes the stored file along with its row — nothing extracted from it is touched. */
export async function deleteCourseDocument(userId: string, document: CourseDocumentRow): Promise<void> {
  const supabase = await createServerSupabaseClient();

  await supabase.storage.from(BUCKET).remove([document.storage_path]);

  const { error } = await supabase
    .from("course_documents")
    .delete()
    .eq("id", document.id)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not delete course document: ${error.message}`);
}

// ------------------------------------------------------------- extraction ---

export type SaveExtractionOutcome = {
  assessmentsSaved: number;
  milestonesSaved: number;
  requirementsSaved: number;
};

/**
 * Writes a reviewed extraction. Every row is marked `verified_by_user: true`
 * — reaching this function at all means the student ticked it on the review
 * screen, which *is* the verification §40.16 asks for.
 */
export async function saveExtractionSelections(
  userId: string,
  timeZone: string,
  input: ConfirmExtractionInput,
): Promise<SaveExtractionOutcome> {
  const document = await getCourseDocument(userId, input.documentId);
  if (!document) throw new Error("Course document not found");
  const courseId = document.course_id;

  const supabase = await createServerSupabaseClient();

  for (const item of input.assessments) {
    const task = await createTask(
      userId,
      {
        ...defaultTaskInput,
        title: item.title,
        courseId,
        taskType: item.assessmentType,
        description: item.description,
        deadlineLocal: item.deadlineLocal ? `${item.deadlineLocal}T23:59` : null,
        estimatedMinutes: resolveMinutes(item.assessmentType, null),
      },
      timeZone,
    );

    const { error } = await supabase.from("assessment_details").insert({
      user_id: userId,
      task_id: task.id,
      course_id: courseId,
      document_id: input.documentId,
      weight_percent: item.weightPercent,
      word_count: item.wordCount,
      assessment_format: item.format,
      source_page: item.sourcePage,
      source_text: item.sourceText,
      confidence: item.confidence,
      verified_by_user: true,
    });
    if (error) throw new Error(`Could not save assessment detail: ${error.message}`);
  }

  if (input.milestones.length > 0) {
    const { error } = await supabase.from("course_milestones").insert(
      input.milestones.map((milestone) => ({
        user_id: userId,
        course_id: courseId,
        document_id: input.documentId,
        title: milestone.title,
        milestone_date: milestone.date,
        type: milestone.type,
        description: milestone.description,
        source_page: milestone.sourcePage,
        source_text: milestone.sourceText,
        confidence: milestone.confidence,
        verified_by_user: true,
      })),
    );
    if (error) throw new Error(`Could not save course milestones: ${error.message}`);
  }

  if (input.requirements.length > 0) {
    const { error } = await supabase.from("course_requirements").insert(
      input.requirements.map((requirement) => ({
        user_id: userId,
        course_id: courseId,
        document_id: input.documentId,
        type: requirement.type,
        title: requirement.title,
        description: requirement.description,
        source_page: requirement.sourcePage,
        source_text: requirement.sourceText,
        confidence: requirement.confidence,
        verified_by_user: true,
      })),
    );
    if (error) throw new Error(`Could not save course requirements: ${error.message}`);
  }

  await markDocumentCompleted(userId, input.documentId);

  return {
    assessmentsSaved: input.assessments.length,
    milestonesSaved: input.milestones.length,
    requirementsSaved: input.requirements.length,
  };
}

// -------------------------------------------------------- reading the knowledge ---

export async function listCourseRequirements(
  userId: string,
  courseId: string,
): Promise<CourseRequirementRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("course_requirements")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Could not load course requirements: ${error.message}`);
  return data ?? [];
}

export async function listCourseMilestones(
  userId: string,
  courseId: string,
): Promise<CourseMilestoneRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("course_milestones")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .order("milestone_date", { ascending: true });

  if (error) throw new Error(`Could not load course milestones: ${error.message}`);
  return data ?? [];
}

export async function listAssessmentDetails(
  userId: string,
  courseId: string,
): Promise<AssessmentDetailRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("assessment_details")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId);

  if (error) throw new Error(`Could not load assessment details: ${error.message}`);
  return data ?? [];
}

/** `assessment_details.task_id` is unique — at most one row per task. */
export async function getAssessmentDetailForTask(
  userId: string,
  taskId: string,
): Promise<AssessmentDetailRow | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("assessment_details")
    .select("*")
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .maybeSingle();

  if (error) throw new Error(`Could not load assessment detail: ${error.message}`);
  return data;
}
