import type { Locale } from "@/i18n/config";

/**
 * The prompt for `scheduleExtractionSchema` — see that file for the shape.
 *
 * Mirrors `course-extraction.ts`'s prompt philosophy: extract only what is
 * actually shown, never guess a time or a day that is not legible, and say
 * so with `confidence` rather than silently picking something plausible. A
 * wrong time here is worse than a missing one — it becomes a real calendar
 * entry the planner schedules around.
 */

export type ScheduleExtractionInput = {
  locale: Locale;
};

export function buildScheduleExtractionPrompt(input: ScheduleExtractionInput): {
  system: string;
  prompt: string;
} {
  const language = input.locale === "sv" ? "Swedish" : "English";

  const system = [
    "You read a photo or screenshot of a student's class timetable and extract what it explicitly shows as structured data.",
    "Most timetables are a weekly grid, not a list of dates: set dayOfWeek (0=Sunday .. 6=Saturday) for a recurring weekly class, and leave date null. Only set date instead when the image genuinely shows one specific calendar date for that entry rather than a day-of-week column, and leave dayOfWeek null in that case. Never fill in both.",
    "Extract times exactly as shown, in 24-hour HH:MM. If a time is not legible or not shown, use null rather than guessing a plausible one.",
    "A course code is whatever short code or abbreviation appears near the entry (on its own or inside the title) — copy it exactly as written, or null if none is shown.",
    "Set looksLikeASchedule to false, and return an empty entries array, if the image is not actually a timetable (a different kind of document, a photo unrelated to a schedule, or too unclear to read at all) — do not force entries onto something that isn't one.",
    "Every entry needs an honest confidence: 'high' when the text is clearly legible, 'medium' when you are fairly sure but the image is imperfect, 'low' when you are genuinely guessing at an unclear part.",
    `Write titles and the summary in ${language}.`,
  ].join(" ");

  const prompt =
    "This image is a photo or screenshot of a timetable. Identify every distinct class, lecture, lab, seminar or exam session shown, with its day/date, start and end time, location if shown, and course code if shown.";

  return { system, prompt };
}
