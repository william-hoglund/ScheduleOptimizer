/**
 * Reads a stored session's guided phase back out of `generation_reason`
 * (the engine records it as `details.phase`, so no extra column is needed).
 */
export type GuidedPhase = "intro" | "work" | "finish";

export function sessionPhase(generationReason: string | null): GuidedPhase | null {
  if (!generationReason) return null;
  try {
    const phase = (JSON.parse(generationReason) as { details?: { phase?: unknown } }).details?.phase;
    return phase === "intro" || phase === "work" || phase === "finish" ? phase : null;
  } catch {
    return null;
  }
}

/** Exams and revision get revision-flavoured guidance; everything else, coursework. */
export function guidanceKind(taskType: string | null | undefined): "exam" | "coursework" {
  return taskType === "exam" || taskType === "revision" ? "exam" : "coursework";
}
