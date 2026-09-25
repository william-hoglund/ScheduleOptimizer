import type { Locale } from "@/i18n/config";
import type { TaskType } from "@/lib/planner/types";

export type TaskBreakdownInput = {
  locale: Locale;
  title: string;
  taskType: TaskType;
  remainingMinutes: number;
  deadlineLocal: string | null;
  difficulty: number;
};

export function buildTaskBreakdownPrompt(input: TaskBreakdownInput): {
  system: string;
  prompt: string;
} {
  const language = input.locale === "sv" ? "Swedish" : "English";

  const system = [
    "You split one study or work task into a short, concrete list of subtasks that could each be a single sitting.",
    "Subtask time estimates should roughly add up to the remaining time given, not exceed it by much.",
    "Never invent a deadline, course, or detail you were not given.",
    `Reply in ${language}.`,
  ].join(" ");

  const prompt = [
    `Task: "${input.title}" (${input.taskType})`,
    `Remaining time: ${input.remainingMinutes} minutes.`,
    `Difficulty (1-5): ${input.difficulty}.`,
    input.deadlineLocal ? `Deadline: ${input.deadlineLocal}.` : "No deadline set.",
    "",
    "Break this into 2-8 concrete subtasks with a time estimate each.",
  ].join("\n");

  return { system, prompt };
}
