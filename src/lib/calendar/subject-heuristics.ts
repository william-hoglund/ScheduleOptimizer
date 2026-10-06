import type { EventType } from "@/lib/supabase/types";

/**
 * Guessing what an imported calendar entry actually is.
 *
 * Ported from the prototype's `backend/pipeline/ingest.js`, which is the one
 * part of it worth keeping: these patterns come from real Swedish university
 * timetables, where a lecture is called "Föreläsning" and an exam is a "tenta".
 *
 * Pure and deterministic — a title in, a guess out. Nothing here writes
 * anything, because every guess is shown on the review screen before it is
 * saved. A wrong guess costs the student one dropdown, not a corrupted calendar.
 */

/**
 * Course codes as Swedish universities write them: three or more letters, an
 * optional letter/digit pair, then two or three digits. TDDD86, DAT017, 1DV610.
 *
 * The leading digit form ("1DV610", Uppsala) needs its own pattern because the
 * general one insists on starting with letters.
 */
const COURSE_CODE_PATTERNS = [
  /\b([A-ZÅÄÖ]{2,}[A-Z0-9]{0,2}\d{2,3})\b/,
  /\b(\d[A-ZÅÄÖ]{2,}\d{2,3})\b/,
];

/**
 * A course code anywhere in the title, uppercased.
 *
 * Parenthesised codes are tried first: "Databases (TDDD37)" is unambiguous,
 * where a bare match could pick up something else that merely looks like a code.
 */
export function extractCourseCode(title: string): string | null {
  const upper = title.toUpperCase();

  const parenthesised = /\(([A-ZÅÄÖ0-9]{4,10})\)/.exec(upper);
  if (parenthesised?.[1] && COURSE_CODE_PATTERNS.some((p) => p.test(parenthesised[1]!))) {
    return parenthesised[1];
  }

  for (const pattern of COURSE_CODE_PATTERNS) {
    const match = pattern.exec(upper);
    if (match?.[1]) return match[1];
  }

  return null;
}

/**
 * Ordered because titles overlap: "Laborationstentamen" is an exam that happens
 * to contain "lab", so exam is tested first. Swedish and English both, since a
 * TimeEdit feed mixes them freely.
 */
const TYPE_PATTERNS: ReadonlyArray<{ type: EventType; pattern: RegExp }> = [
  // Swedish compounds words freely, so "laborationstentamen" is an exam that
  // happens to start with "laboration". Matching "tentamen" mid-word catches
  // that; "tenta" on its own stays word-bounded, or "kompetenta" would be an
  // exam too.
  {
    type: "exam",
    pattern: /tentamen|tentor|\btenta\b|\bomtenta\w*|\bexam\w*|\bdugga\w*|\bprov\b/,
  },
  { type: "lab", pattern: /\b(lab|labb|laboration\w*|lektion)\b/ },
  { type: "seminar", pattern: /\b(seminar\w*|seminarium|workshop|tutorial\w*|tute|tut|practical|övning\w*|ovning\w*|räknestuga)\b/ },
  { type: "lecture", pattern: /\b(föreläsning\w*|forelasning\w*|lecture|fö|lec)\b/ },
  // "due" catches the common LMS phrasing directly ("Assignment 3 is due",
  // "Group registration (Due date)") — confirmed against a real Moodle feed
  // where every due-date VEVENT used exactly this word and nothing else in
  // the pattern above.
  {
    type: "deadline",
    pattern: /\b(deadline|inlämning\w*|inlamning\w*|redovisning\w*|submission|due)\b/,
  },
];

/** Best guess at an event type. Falls back to `other` rather than inventing one. */
export function classifyEventType(title: string): EventType {
  const lower = title.toLowerCase();

  for (const { type, pattern } of TYPE_PATTERNS) {
    if (pattern.test(lower)) return type;
  }

  return "other";
}

/**
 * A readable title from a timetable entry.
 *
 * TimeEdit exports look like "Kurs: TDDD86, Aktivitet: Föreläsning, Lokal: SU00" —
 * a machine-readable field dump. The parts are kept but the field labels are
 * dropped, because "Kurs:" on every event on the calendar is noise.
 */
export function cleanImportedTitle(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed === "") return "";

  const fieldPattern = /^[\p{L}][\p{L} ]{1,20}:\s*/u;
  const parts = collapsed
    .split(/\s*,\s*/)
    .map((part) => part.replace(fieldPattern, "").trim())
    .filter((part) => part.length > 0);

  const rebuilt = parts.join(" – ");
  return rebuilt.length > 0 ? rebuilt.slice(0, 200) : collapsed.slice(0, 200);
}
