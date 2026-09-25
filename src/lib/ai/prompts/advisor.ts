import type { Locale } from "@/i18n/config";
import type { Segment } from "@/lib/segments";
import { advisorSystemPrompt } from "../guardrails";

export type AdvisorCourse = {
  id: string;
  name: string;
  priority: number;
};

export type AdvisorTask = {
  id: string;
  title: string;
  courseName: string | null;
  deadlineLocal: string | null;
  priority: number;
};

export type AdvisorInput = {
  locale: Locale;
  segment: Segment;
  todayLocal: string;
  message: string;
  courses: AdvisorCourse[];
  upcomingTasks: AdvisorTask[];
  hasCurrentPlan: boolean;
};

const MAX_COURSES_IN_PROMPT = 20;
const MAX_TASKS_IN_PROMPT = 15;

/** See AI_LIMITS and PLAN.md §8 "hard cap on how much data goes into a prompt". */
export function boundAdvisorContext(
  courses: AdvisorCourse[],
  upcomingTasks: AdvisorTask[],
): Pick<AdvisorInput, "courses" | "upcomingTasks"> {
  return {
    courses: courses.slice(0, MAX_COURSES_IN_PROMPT),
    upcomingTasks: upcomingTasks.slice(0, MAX_TASKS_IN_PROMPT),
  };
}

export function buildAdvisorPrompt(input: AdvisorInput): { system: string; prompt: string } {
  const system = advisorSystemPrompt(input.locale);

  const courseLines =
    input.courses.length > 0
      ? input.courses.map((c) => `- ${c.id}: "${c.name}" (priority ${c.priority}/5)`).join("\n")
      : "- none";

  const taskLines =
    input.upcomingTasks.length > 0
      ? input.upcomingTasks
          .map(
            (t) =>
              `- "${t.title}"${t.courseName ? ` (${t.courseName})` : ""}, priority ${t.priority}/5` +
              (t.deadlineLocal ? `, due ${t.deadlineLocal}` : ", no deadline"),
          )
          .join("\n")
      : "- none";

  const prompt = [
    `Today: ${input.todayLocal}.`,
    input.hasCurrentPlan ? "There is a current plan for this period." : "No plan exists for this period yet.",
    "",
    "Courses (id: name):",
    courseLines,
    "",
    "Upcoming tasks:",
    taskLines,
    "",
    `The student wrote: "${input.message}"`,
    "",
    "If this asks for a concrete, achievable change to their plan or a course's priority, propose one action using only the ids listed above. Otherwise set action.kind to \"none\".",
  ].join("\n");

  return { system, prompt };
}
