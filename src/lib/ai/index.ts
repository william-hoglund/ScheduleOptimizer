import "server-only";

import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { finalizeAdvisorReply, precheckAdvisorMessage } from "./guardrails";
import { buildAdvisorPrompt, type AdvisorInput } from "./prompts/advisor";
import { buildCourseExtractionPrompt, type CourseExtractionInput } from "./prompts/course-extraction";
import { buildExplainPlanPrompt, type ExplainPlanInput } from "./prompts/explain-plan";
import { buildScheduleExtractionPrompt, type ScheduleExtractionInput } from "./prompts/schedule-extraction";
import { buildTaskBreakdownPrompt, type TaskBreakdownInput } from "./prompts/task-breakdown";
import { createAnthropicProvider } from "./providers/anthropic";
import { createOpenAiProvider } from "./providers/openai";
import { advisorReplySchema, type AdvisorReply } from "./schemas/advisor";
import { courseExtractionSchema, type CourseExtraction } from "./schemas/course-extraction";
import { planExplanationSchema, type PlanExplanation } from "./schemas/explain-plan";
import { scheduleExtractionSchema, type ScheduleExtraction } from "./schemas/schedule-extraction";
import { taskBreakdownSchema, type TaskBreakdown } from "./schemas/task-breakdown";
import { AI_LIMITS, type AiProvider, type ImageInput } from "./types";

/**
 * The provider-agnostic client.
 *
 * "The product works with AI disabled" (PLAN.md §8) is enforced here, not
 * scattered across every caller: `isAiEnabled()` is the one question anything
 * else needs to ask, and every generation function below returns `null`
 * rather than throwing when the provider is unreachable or misbehaves twice
 * in a row — a broken or absent AI key degrades a feature, it never breaks a
 * page.
 */

export function isAiEnabled(): boolean {
  const env = getServerEnv();
  return env.AI_PROVIDER === "anthropic" ? Boolean(env.ANTHROPIC_API_KEY) : Boolean(env.OPENAI_API_KEY);
}

function getProvider(): AiProvider {
  const env = getServerEnv();
  if (env.AI_PROVIDER === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
    return createAnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
  }
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  return createOpenAiProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
}

/** One retry on a schema mismatch or a transient provider error; null if both attempts fail. */
async function generateWithRetry<S extends z.ZodTypeAny>(request: {
  system: string;
  prompt: string;
  schema: S;
  maxOutputTokens: number;
  images?: ImageInput[];
}): Promise<z.infer<S> | null> {
  const provider = getProvider();

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await provider.generateObject(request);
    } catch (cause) {
      console.error(`[ai] generateObject attempt ${attempt} failed:`, cause);
    }
  }
  return null;
}

export async function explainPlan(input: ExplainPlanInput): Promise<PlanExplanation | null> {
  const { system, prompt } = buildExplainPlanPrompt(input);
  return generateWithRetry({
    system,
    prompt,
    schema: planExplanationSchema,
    maxOutputTokens: AI_LIMITS.explainPlan,
  });
}

export async function breakdownTask(input: TaskBreakdownInput): Promise<TaskBreakdown | null> {
  const { system, prompt } = buildTaskBreakdownPrompt(input);
  return generateWithRetry({
    system,
    prompt,
    schema: taskBreakdownSchema,
    maxOutputTokens: AI_LIMITS.taskBreakdown,
  });
}

export async function extractCourseKnowledge(
  input: CourseExtractionInput,
): Promise<CourseExtraction | null> {
  const { system, prompt } = buildCourseExtractionPrompt(input);
  return generateWithRetry({
    system,
    prompt,
    schema: courseExtractionSchema,
    maxOutputTokens: AI_LIMITS.courseExtraction,
  });
}

export async function extractSchedule(
  input: ScheduleExtractionInput & { image: ImageInput },
): Promise<ScheduleExtraction | null> {
  const { system, prompt } = buildScheduleExtractionPrompt(input);
  return generateWithRetry({
    system,
    prompt,
    schema: scheduleExtractionSchema,
    maxOutputTokens: AI_LIMITS.scheduleExtraction,
    images: [input.image],
  });
}

export type AdvisorOutcome =
  | { ok: true; reply: AdvisorReply }
  | { ok: false; reason: "empty" | "tooLong" | "unavailable" };

/**
 * The only AI entry point that takes free text from the student.
 *
 * `precheckAdvisorMessage` runs before anything is sent anywhere, and
 * `finalizeAdvisorReply` runs on the way back out — see guardrails.ts for why
 * both matter and why the schema alone is not treated as sufficient.
 */
export async function askAdvisor(input: AdvisorInput): Promise<AdvisorOutcome> {
  const precheck = precheckAdvisorMessage(input.message);
  if (!precheck.ok) return { ok: false, reason: precheck.reason };

  const { system, prompt } = buildAdvisorPrompt(input);
  const raw = await generateWithRetry({
    system,
    prompt,
    schema: advisorReplySchema,
    maxOutputTokens: AI_LIMITS.advisorReply,
  });
  if (!raw) return { ok: false, reason: "unavailable" };

  return { ok: true, reply: finalizeAdvisorReply(raw, input.locale) };
}

export type { AdvisorReply, PlannerCommand } from "./schemas/advisor";
export type {
  CourseExtraction,
  ExtractedAssessment,
  ExtractedMilestone,
  ExtractedRequirement,
} from "./schemas/course-extraction";
export type { PlanExplanation } from "./schemas/explain-plan";
export type { ExtractedScheduleEntry, ScheduleExtraction } from "./schemas/schedule-extraction";
export type { TaskBreakdown } from "./schemas/task-breakdown";
export type { ImageInput } from "./types";
export type { AdvisorBehaviorHighlight, AdvisorCourse, AdvisorTask } from "./prompts/advisor";
export { boundAdvisorContext } from "./prompts/advisor";
export { boundExplainPlanSessions, type ExplainPlanSession } from "./prompts/explain-plan";
