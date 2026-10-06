import { z } from "zod";

/**
 * What the Learn page gets back. Structured, like every other AI feature here
 * (see types.ts), so the page renders sections, key points and quiz cards
 * rather than guessing at a paragraph.
 */
export const STUDY_HELP_MODES = ["summary", "explain", "ask", "quiz"] as const;
export type StudyHelpMode = (typeof STUDY_HELP_MODES)[number];

export const studyHelpSchema = z.object({
  /**
   * False when the material doesn't cover what was asked. The page then shows
   * that plainly instead of an answer drawn from general knowledge.
   */
  coveredByMaterial: z.boolean(),
  title: z.string().min(1).max(160),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).max(120),
        body: z.string().min(1).max(1500),
      }),
    )
    .max(6),
  keyPoints: z.array(z.string().min(1).max(240)).max(8),
  /** Only filled in quiz mode. */
  quiz: z
    .array(
      z.object({
        question: z.string().min(1).max(300),
        answer: z.string().min(1).max(600),
      }),
    )
    .max(8),
  /** Where in the material this came from, so the student can go back to the slide. */
  sources: z
    .array(
      z.object({
        documentName: z.string().min(1).max(200),
        page: z.number().int().min(1).nullable(),
      }),
    )
    .max(10),
});

export type StudyHelp = z.infer<typeof studyHelpSchema>;
