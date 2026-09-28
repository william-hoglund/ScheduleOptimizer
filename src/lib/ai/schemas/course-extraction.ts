import { z } from "zod";

/**
 * Structured output for "read this course document and tell me what's in
 * it" (docs/PLAN.md §40.2). Every extracted item carries its own
 * `confidence` and a source reference (`sourcePage` / `sourceText`) — see
 * §40.11 and §40.16. There is no field anywhere in this schema for an AI
 * *recommendation*; a prep timeline or "start research on X" suggestion is
 * generated separately, through the advisor's propose/confirm path, never
 * mixed into what this schema calls a fact.
 *
 * `assessmentType` intentionally reuses the coursework subset of
 * `TaskType` (`assignment` | `exam` | `reading` | `project` | `lab` |
 * `presentation` | `other`) so a confirmed assessment maps onto a `tasks`
 * row with no translation table in between.
 */

const confidenceSchema = z.enum(["high", "medium", "low"]);

/** A short verbatim-ish snippet, not a citation system — enough for a student to Ctrl+F the original. */
const sourceTextSchema = z.string().max(300).nullable();
const sourcePageSchema = z.number().int().positive().nullable();

const extractedAssessmentSchema = z.object({
  title: z.string().min(1).max(120),
  assessmentType: z.enum(["assignment", "exam", "reading", "project", "lab", "presentation", "other"]),
  /** ISO date (YYYY-MM-DD) if a specific due date is stated; null if not. Never inferred. */
  deadlineLocal: z.string().nullable(),
  weightPercent: z.number().min(0).max(100).nullable(),
  wordCount: z.number().int().positive().nullable(),
  format: z.enum(["individual", "group", "presentation", "exam", "other"]).nullable(),
  description: z.string().max(600).nullable(),
  sourcePage: sourcePageSchema,
  sourceText: sourceTextSchema,
  confidence: confidenceSchema,
});

const extractedMilestoneSchema = z.object({
  title: z.string().min(1).max(120),
  /** ISO date. Null when the document names a period ("reading week") without a specific date. */
  date: z.string().nullable(),
  type: z.enum(["teaching_period", "reading_week", "assessment_period", "exam_period", "other"]),
  description: z.string().max(400).nullable(),
  sourcePage: sourcePageSchema,
  sourceText: sourceTextSchema,
  confidence: confidenceSchema,
});

const extractedRequirementSchema = z.object({
  type: z.enum(["reading", "topic", "exam_format", "grading", "policy", "other"]),
  title: z.string().min(1).max(120),
  description: z.string().max(600).nullable(),
  sourcePage: sourcePageSchema,
  sourceText: sourceTextSchema,
  confidence: confidenceSchema,
});

export const courseExtractionSchema = z.object({
  /** One or two sentences, shown while the student reviews — not stored as a fact anywhere. */
  documentSummary: z.string().max(400),
  courseNameGuess: z.string().max(120).nullable(),
  courseCodeGuess: z.string().max(20).nullable(),
  assessments: z.array(extractedAssessmentSchema).max(30),
  milestones: z.array(extractedMilestoneSchema).max(30),
  requirements: z.array(extractedRequirementSchema).max(40),
});

export type CourseExtraction = z.infer<typeof courseExtractionSchema>;
export type ExtractedAssessment = z.infer<typeof extractedAssessmentSchema>;
export type ExtractedMilestone = z.infer<typeof extractedMilestoneSchema>;
export type ExtractedRequirement = z.infer<typeof extractedRequirementSchema>;
