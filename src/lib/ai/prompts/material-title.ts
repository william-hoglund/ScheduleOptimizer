import type { Locale } from "@/i18n/config";

/**
 * Names study material the student didn't title, by what it actually is —
 * matched against the course outline when it fits ("Week 5 — Customer
 * discovery"), otherwise from the text itself.
 */

export type MaterialTitleInput = {
  locale: Locale;
  courseName: string;
  /** Outline items: milestones and assessments, already formatted one per line. */
  outline: string[];
  /** Names of material already in the course, so new names follow the same style. */
  existingNames: string[];
  text: string;
  /** An uploaded file's own name, which may already say what it is. */
  originalName?: string;
};

/** The opening of a document says what it is; the rest only costs tokens. */
const MAX_TEXT_CHARS = 6_000;

export function buildMaterialTitlePrompt(input: MaterialTitleInput): { system: string; prompt: string } {
  const language = input.locale === "sv" ? "Swedish" : "English";

  const system = [
    "You give a short, descriptive title to a piece of course material a university student saved without naming it.",
    "If the text clearly matches a week, topic, lecture or assessment in the course outline, name it after that (e.g. 'Week 5 — Customer discovery', 'Assignment 2 brief').",
    "Otherwise describe what the text is about in a few words (e.g. 'Notes on lean startup and MVPs').",
    "If an original file name is given and it already clearly says what the material is (e.g. 'Week 5 Lecture - Customer Discovery.pdf'), keep its meaning and just tidy it (no extension, underscores or version noise). If it is codes, dates or noise (e.g. 'CO_ELEC4445_1_2025_Term3_T3_InPerson.pdf'), ignore it and title from the content.",
    "If existing material names follow a pattern, match it. At most 8 words. No quotes, no file extension.",
    `Write the title in ${language}, unless the material itself is clearly in another language — then use that language.`,
  ].join("\n");

  const prompt = [
    `Course: ${input.courseName}`,
    "",
    "Course outline:",
    input.outline.length > 0 ? input.outline.join("\n") : "(none recorded)",
    "",
    "Existing material:",
    input.existingNames.length > 0 ? input.existingNames.join("\n") : "(none)",
    "",
    ...(input.originalName ? [`Original file name: ${input.originalName}`, ""] : []),
    "The material's text:",
    input.text.slice(0, MAX_TEXT_CHARS),
  ].join("\n");

  return { system, prompt };
}

/** Without AI: the first meaningful line, trimmed to a sensible length. */
export function fallbackMaterialTitle(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[#>*\-\s]+/, "").trim())
    .find((l) => l.length >= 3);
  if (!line) return null;
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line;
}
