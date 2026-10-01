import type { z } from "zod";

/**
 * The provider-agnostic contract.
 *
 * Every AI feature in this product asks for structured data back, never a raw
 * chat reply — even "explain this plan" returns `{ summary, highlights[] }`,
 * not a paragraph the UI has to guess at. That is what makes the two providers
 * interchangeable behind one interface, and it is the first line of defence
 * against this becoming a general-purpose chatbot: there is no code path that
 * takes an arbitrary prompt and renders arbitrary text back to the student.
 * See guardrails.ts for the second line, which matters for the one feature
 * (the advisor) that does take free text from the student.
 */
export type ImageInput = {
  base64: string;
  /** Matches Anthropic's image media-type union exactly, which is the tighter of the two providers'. */
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
};

export type GenerateObjectRequest<S extends z.ZodTypeAny> = {
  system: string;
  prompt: string;
  schema: S;
  /** A cost and latency cap, not a suggestion — see AI_LIMITS. */
  maxOutputTokens: number;
  /** A photo or screenshot alongside the prompt — currently only the image schedule import uses this. */
  images?: ImageInput[];
};

export interface AiProvider {
  generateObject<S extends z.ZodTypeAny>(request: GenerateObjectRequest<S>): Promise<z.infer<S>>;
}

/** No usable key for the configured provider. Callers check `isAiEnabled()` first. */
export class AiUnavailableError extends Error {}

/** The provider replied, but not with something the schema accepts, twice in a row. */
export class AiResponseInvalidError extends Error {}

/** Shared cost/latency caps. One place to tighten them if a bill says to. */
export const AI_LIMITS = {
  explainPlan: 700,
  taskBreakdown: 500,
  advisorReply: 500,
  /** A syllabus can list many assessments/milestones/requirements — the widest budget here on purpose. */
  courseExtraction: 3000,
  /** A packed weekly timetable can list 20-30 distinct sessions. */
  scheduleExtraction: 3000,
  /** Characters. Past this, a message is rejected before it ever reaches a provider. */
  maxAdvisorMessageChars: 600,
  /** Bytes. A vision call's cost scales with image size, not just token count. */
  maxScheduleImageBytes: 8 * 1024 * 1024,
} as const;
