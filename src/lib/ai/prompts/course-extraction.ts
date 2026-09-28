import type { Locale } from "@/i18n/config";
import type { DocumentPage } from "@/lib/documents/extract-text";

/**
 * Turns extracted document pages into the prompt for `courseExtractionSchema`.
 *
 * The house rule for every other AI feature applies here too, and matters
 * more: never invent something not given. A syllabus is the one place a
 * hallucinated fact (a wrong deadline, a wrong weight) would do real damage
 * if it silently became a hard planner constraint — the schema's
 * `confidence` field and the caller's "unverified facts don't drive
 * scheduling until confirmed" rule (§40.16) are what make that survivable,
 * but the prompt still asks the model not to guess in the first place.
 */

export type CourseExtractionInput = {
  locale: Locale;
  courseName: string;
  pages: DocumentPage[];
};

/**
 * A syllabus is a handful of pages; this is generous headroom, not a typical
 * case. Truncating on a page boundary keeps `sourcePage` numbers honest —
 * cutting mid-page would leave the model unable to say where a fact near the
 * cut actually came from.
 */
const MAX_DOCUMENT_CHARS = 24_000;

/** Caps how much of a document reaches the model — see AI_LIMITS and PLAN.md §8 "AI cost and latency". */
export function boundDocumentPages(pages: DocumentPage[]): {
  pages: DocumentPage[];
  truncated: boolean;
} {
  const kept: DocumentPage[] = [];
  let usedChars = 0;

  for (const page of pages) {
    if (usedChars + page.text.length > MAX_DOCUMENT_CHARS && kept.length > 0) {
      return { pages: kept, truncated: true };
    }
    kept.push(page);
    usedChars += page.text.length;
  }

  return { pages: kept, truncated: false };
}

export function buildCourseExtractionPrompt(input: CourseExtractionInput): {
  system: string;
  prompt: string;
} {
  const language = input.locale === "sv" ? "Swedish" : "English";

  const system = [
    "You read a university course document (a syllabus, schedule, or assessment guide) and extract what it explicitly states as structured data.",
    "Extract only what the text actually says. Never invent a date, weight, word count, or requirement that is not stated or very clearly implied.",
    "When a value is genuinely not in the document, use null for it rather than guessing.",
    "Every date field must be a single calendar date in YYYY-MM-DD format, or null. If the document gives a date range or a vague period (e.g. 'week of', 'reading week 12-16 October') rather than one specific date, use null — do not write the range as text in the date field.",
    "Every item you extract needs an honest confidence: 'high' when the text states it plainly, 'medium' when it is strongly implied, 'low' when you are inferring from limited context.",
    "For every item, note the page it came from and copy a short snippet of the source text, so the student can verify it against the original.",
    `Write titles, descriptions and the summary in ${language}.`,
  ].join(" ");

  const { pages, truncated } = boundDocumentPages(input.pages);
  const pageBlocks = pages
    .map((page) => `--- Page ${page.pageNumber} ---\n${page.text.trim()}`)
    .join("\n\n");

  const prompt = [
    `Course (as already known in the app): "${input.courseName}".`,
    "",
    "Document text:",
    pageBlocks || "(no extractable text)",
    truncated ? "\n(document continues beyond what is shown here)" : "",
    "",
    "Extract every assessment (assignments, exams, projects, presentations, labs, readings with a deadline), every milestone (teaching period boundaries, reading week, assessment or exam periods), and every other requirement (readings, topics, exam format, grading rules, policies) the document states.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, prompt };
}
