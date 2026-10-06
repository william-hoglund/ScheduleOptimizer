import type { Locale } from "@/i18n/config";
import type { DocumentPage } from "@/lib/documents/extract-text";

import type { StudyHelpMode } from "../schemas/study-help";

/**
 * The Learn page's prompt: help the student study *their own* course material.
 *
 * The house rule (never invent) becomes "stay inside the material": an answer
 * is only useful for revision if it matches what the lecturer actually taught,
 * so anything the material doesn't cover is reported as not covered rather
 * than filled in from general knowledge.
 */

export type StudyMaterial = { documentName: string; pages: DocumentPage[] };

export type StudyHelpInput = {
  locale: Locale;
  courseName: string;
  mode: StudyHelpMode;
  /** Topic or question. Optional for summary and quiz. */
  request: string;
  materials: StudyMaterial[];
};

/** Across all selected documents. A few lectures' slides fit comfortably. */
const MAX_MATERIAL_CHARS = 40_000;

/** Cuts on page boundaries, so page references stay honest (as in course-extraction.ts). */
export function boundStudyMaterials(materials: StudyMaterial[]): {
  materials: StudyMaterial[];
  truncated: boolean;
} {
  const kept: StudyMaterial[] = [];
  let used = 0;

  for (const material of materials) {
    const pages: DocumentPage[] = [];
    for (const page of material.pages) {
      if (page.text.trim().length === 0) continue;
      if (used + page.text.length > MAX_MATERIAL_CHARS && (kept.length > 0 || pages.length > 0)) {
        if (pages.length > 0) kept.push({ ...material, pages });
        return { materials: kept, truncated: true };
      }
      pages.push(page);
      used += page.text.length;
    }
    if (pages.length > 0) kept.push({ ...material, pages });
  }

  return { materials: kept, truncated: false };
}

const MODE_INSTRUCTIONS: Record<StudyHelpMode, string> = {
  summary:
    "Summarise the material for revision: the main ideas in a logical order, one section per major topic, and the key points a student must remember. If a focus is given, summarise only that part.",
  explain:
    "Explain the requested topic clearly, as a good tutor would, building from basics to the harder parts, using the material's own definitions and examples. Leave quiz empty.",
  ask: "Answer the student's question directly and precisely from the material, then add any context from the material that helps understanding. Leave quiz empty.",
  quiz: "Write 5-8 quiz questions that test understanding (not trivia) of the material, each with a model answer. If a focus is given, quiz only on that. Sections may be empty; key points should list what the quiz covers.",
};

export function buildStudyHelpPrompt(input: StudyHelpInput): { system: string; prompt: string } {
  const language = input.locale === "sv" ? "Swedish" : "English";

  const system = [
    "You are a study helper inside a student's study planner. You help them learn from their own course material: lecture slides and notes they uploaded.",
    "Use only the material provided. Do not add facts, formulas or claims that are not in it. If the material does not cover what was asked, set coveredByMaterial to false, say so briefly in the title, and leave the other fields empty or minimal.",
    "If the request is not about studying this material at all, treat it as not covered.",
    "Cite where things came from in sources, using the document name and page/slide number exactly as labelled.",
    "Write for a university student: clear, concrete, no filler. Plain text only — no markdown symbols.",
    `Respond in ${language}.`,
    MODE_INSTRUCTIONS[input.mode],
  ].join("\n");

  const material = input.materials
    .map((doc) =>
      doc.pages.map((page) => `[${doc.documentName} — page ${page.pageNumber}]\n${page.text}`).join("\n\n"),
    )
    .join("\n\n");

  const request = input.request.trim();
  const prompt = [
    `Course: ${input.courseName}`,
    `Mode: ${input.mode}`,
    request ? `Student's request: ${request}` : "Student's request: (none — cover the material as a whole)",
    "",
    "Material:",
    material,
  ].join("\n");

  return { system, prompt };
}
