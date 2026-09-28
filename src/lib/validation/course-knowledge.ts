import { z } from "zod";

import { V } from "./messages";

/**
 * Course documents and the structured facts extracted from them.
 *
 * The review-then-confirm shape here matches `.ics` import
 * (`lib/validation/import-export.ts`): the browser holds the AI's proposed
 * extraction in state, the student ticks what to keep and can correct a
 * field first, and this schema re-validates every row on the way back in —
 * the server never trusts that what comes back is what it originally sent.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const COURSE_DOCUMENT_TYPES = [
  "syllabus",
  "schedule",
  "assessment_guide",
  "reading_list",
  "other",
] as const;

export const SUPPORTED_DOCUMENT_MIME_TYPES = ["application/pdf", "text/plain", "text/markdown"] as const;

/** A syllabus is rarely more than a few MB; this stops an upload used to fill storage. */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export const documentUploadSchema = z.object({
  courseId: z.uuid(),
  fileName: z.string().trim().min(1, V.required).max(200, V.nameTooLong),
  fileSize: z.number().int().positive().max(MAX_DOCUMENT_BYTES, V.outOfRange),
  mimeType: z.enum(SUPPORTED_DOCUMENT_MIME_TYPES),
  storagePath: z.string().min(1).max(500),
  documentType: z.enum(COURSE_DOCUMENT_TYPES),
});

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;

const confidenceSchema = z.enum(["high", "medium", "low"]);
const sourcePageSchema = z.number().int().positive().nullable();
const sourceTextSchema = z.string().max(300).nullable();

/** One reviewed assessment row: becomes a `tasks` row plus an `assessment_details` row. */
export const assessmentSelectionSchema = z.object({
  title: z.string().trim().min(1, V.required).max(120, V.nameTooLong),
  assessmentType: z.enum(["assignment", "exam", "reading", "project", "lab", "presentation", "other"]),
  deadlineLocal: z.string().regex(ISO_DATE, V.outOfRange).nullable(),
  weightPercent: z.number().min(0, V.outOfRange).max(100, V.outOfRange).nullable(),
  wordCount: z.number().int().positive(V.outOfRange).nullable(),
  format: z.enum(["individual", "group", "presentation", "exam", "other"]).nullable(),
  description: z.string().max(600, V.tooLong).nullable(),
  sourcePage: sourcePageSchema,
  sourceText: sourceTextSchema,
  confidence: confidenceSchema,
});

/** A milestone with no confirmed date is not offered for saving — `course_milestones.milestone_date` is required. */
export const milestoneSelectionSchema = z.object({
  title: z.string().trim().min(1, V.required).max(120, V.nameTooLong),
  date: z.string().regex(ISO_DATE, V.outOfRange),
  type: z.enum(["teaching_period", "reading_week", "assessment_period", "exam_period", "other"]),
  description: z.string().max(400, V.tooLong).nullable(),
  sourcePage: sourcePageSchema,
  sourceText: sourceTextSchema,
  confidence: confidenceSchema,
});

export const requirementSelectionSchema = z.object({
  type: z.enum(["reading", "topic", "exam_format", "grading", "policy", "other"]),
  title: z.string().trim().min(1, V.required).max(120, V.nameTooLong),
  description: z.string().max(600, V.tooLong).nullable(),
  sourcePage: sourcePageSchema,
  sourceText: sourceTextSchema,
  confidence: confidenceSchema,
});

export type AssessmentSelection = z.infer<typeof assessmentSelectionSchema>;
export type MilestoneSelection = z.infer<typeof milestoneSelectionSchema>;
export type RequirementSelection = z.infer<typeof requirementSelectionSchema>;

export const confirmExtractionSchema = z.object({
  documentId: z.uuid(),
  assessments: z.array(assessmentSelectionSchema).max(30),
  milestones: z.array(milestoneSelectionSchema).max(30),
  requirements: z.array(requirementSelectionSchema).max(40),
});

export type ConfirmExtractionInput = z.infer<typeof confirmExtractionSchema>;
