import type { Locale } from "@/i18n/config";
import type { TaskType } from "@/lib/planner/types";

export type TaskBreakdownInput = {
  locale: Locale;
  title: string;
  taskType: TaskType;
  remainingMinutes: number;
  deadlineLocal: string | null;
  difficulty: number;
  /**
   * When the task is a known assessment type (docs/PLAN.md's Assessment
   * Intelligence feature — see `lib/assessment/workflow-templates.ts`), the
   * deterministic stage vocabulary for that type, in order. The model
   * allocates time across exactly these stages rather than inventing its own
   * breakdown shape; absent for an ordinary task, which keeps today's
   * generic behavior unchanged.
   */
  stageNames?: readonly string[];
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

  const prompt = input.stageNames
    ? [
        `Task: "${input.title}" (${input.taskType})`,
        `Remaining time: ${input.remainingMinutes} minutes.`,
        `Difficulty (1-5): ${input.difficulty}.`,
        input.deadlineLocal ? `Deadline: ${input.deadlineLocal}.` : "No deadline set.",
        "",
        `This is a ${input.taskType} assessment with a known workflow. Allocate the remaining time across exactly these stages, in this order: ${input.stageNames.join(", ")}.`,
        "One subtask per stage, titled as a natural translation of that stage's name — do not invent additional top-level stages or skip any.",
        `You may split at most one stage into two subtasks if the remaining time genuinely warrants finer detail, so the total stays between ${input.stageNames.length} and ${Math.min(input.stageNames.length + 1, 8)} subtasks.`,
      ].join("\n")
    : [
        `Task: "${input.title}" (${input.taskType})`,
        `Remaining time: ${input.remainingMinutes} minutes.`,
        `Difficulty (1-5): ${input.difficulty}.`,
        input.deadlineLocal ? `Deadline: ${input.deadlineLocal}.` : "No deadline set.",
        "",
        "Break this into 2-8 concrete subtasks with a time estimate each.",
      ].join("\n");

  return { system, prompt };
}
