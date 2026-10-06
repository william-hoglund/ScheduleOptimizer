import { z } from "zod";

import { AI_LIMITS } from "@/lib/ai/types";
import { STUDY_HELP_MODES } from "@/lib/ai/schemas/study-help";

import { V } from "./messages";

/** A Learn page request. Explain and ask need something to explain or answer. */
export const studyHelpRequestSchema = z
  .object({
    courseId: z.uuid(),
    documentIds: z.array(z.uuid()).min(1, V.required).max(20),
    mode: z.enum(STUDY_HELP_MODES),
    request: z.string().trim().max(AI_LIMITS.maxStudyRequestChars, V.tooLong),
  })
  .refine((v) => (v.mode === "explain" || v.mode === "ask" ? v.request.length > 0 : true), {
    message: V.required,
    path: ["request"],
  });

export type StudyHelpRequest = z.infer<typeof studyHelpRequestSchema>;
