import { isoWeekday, localDatesInRange } from "@/lib/planner/time-grid";

/**
 * Turns a student's planning note into dated instructions.
 *
 * Relative dates ("Thursday to Monday", "next week") are where a model goes
 * wrong, so the prompt hands it an explicit calendar of the coming weeks with
 * weekday names instead of trusting it to do date arithmetic.
 */

export type PlanNotesTask = { id: string; title: string; courseName: string | null; deadline: string | null };

export type PlanNotesInput = {
  note: string;
  today: string;
  horizonStart: string;
  horizonEnd: string;
  tasks: PlanNotesTask[];
};

const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildPlanNotesPrompt(input: PlanNotesInput): { system: string; prompt: string } {
  const system = [
    "You turn a university student's note about their upcoming study plan into structured instructions for a scheduling engine.",
    "Only two kinds of instruction exist: whole days they cannot study (unavailable), and a date by which a specific task must be finished (finishBy).",
    "Use the calendar provided to resolve weekdays and relative dates; never guess a date outside it. Ranges are inclusive.",
    "If they say they are away/travelling from day A to day B, mark A through B unavailable.",
    "'Finish X before <day>' means finishBy is the day BEFORE <day>; 'finish X by <day>' means that day.",
    "For finishBy, taskId must be the id of a task from the list that clearly matches what they named (course + assessment name). If no task clearly matches, put it in notUnderstood instead.",
    "Anything else in the note that does not fit these two kinds goes in notUnderstood, briefly. Never invent instructions the note does not contain.",
    "Labels are short and in the same language as the note.",
  ].join("\n");

  const calendar = localDatesInRange(input.today, addDays(input.today, 41))
    .map((date) => `${date} ${WEEKDAYS[isoWeekday(date)]}${date === input.today ? " (today)" : ""}`)
    .join("\n");

  const tasks = input.tasks
    .map(
      (task) =>
        `- id=${task.id} | ${task.title}${task.courseName ? ` | course: ${task.courseName}` : ""}${task.deadline ? ` | due ${task.deadline}` : ""}`,
    )
    .join("\n");

  const prompt = [
    `Plan period: ${input.horizonStart} to ${input.horizonEnd}`,
    "",
    "Calendar:",
    calendar,
    "",
    "Open tasks:",
    tasks || "(none)",
    "",
    "Student's note:",
    input.note.trim(),
  ].join("\n");

  return { system, prompt };
}
