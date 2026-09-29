import type { LearningConfidence, LearningProfileInsightRow } from "@/lib/supabase/types";

/**
 * Most-confident, best-evidenced insight first. Shared by the Weekly Review
 * page (which shows the single top insight) and the advisor's context
 * (which shows a short list) — both want the same ordering.
 */

const CONFIDENCE_RANK: Record<LearningConfidence, number> = { high: 3, medium: 2, low: 1 };

/** Excludes anything the student has dismissed — "not accurate for me" means never surfaced again. */
export function rankActiveInsights(
  insights: readonly LearningProfileInsightRow[],
): LearningProfileInsightRow[] {
  return insights
    .filter((insight) => !insight.overridden_by_user)
    .sort((a, b) => {
      const byConfidence = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
      return byConfidence !== 0 ? byConfidence : b.observation_count - a.observation_count;
    });
}
