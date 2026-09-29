import { describe, expect, it } from "vitest";

import { rankActiveInsights } from "@/lib/learning/rank-insights";
import type { LearningProfileInsightRow } from "@/lib/supabase/types";

function insight(overrides: Partial<LearningProfileInsightRow> = {}): LearningProfileInsightRow {
  return {
    id: "insight-1",
    user_id: "user-1",
    insight_type: "best_study_band",
    course_id: null,
    scope_key: "global",
    computed_value: { band: "morning" },
    confidence: "medium",
    observation_count: 10,
    computed_at: "2026-09-01T00:00:00.000Z",
    overridden_by_user: false,
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("rankActiveInsights", () => {
  it("excludes anything the student has dismissed", () => {
    const dismissed = insight({ id: "dismissed", overridden_by_user: true });
    const active = insight({ id: "active" });
    expect(rankActiveInsights([dismissed, active]).map((i) => i.id)).toEqual(["active"]);
  });

  it("puts higher confidence first regardless of list order", () => {
    const low = insight({ id: "low", confidence: "low" });
    const high = insight({ id: "high", confidence: "high" });
    const medium = insight({ id: "medium", confidence: "medium" });
    expect(rankActiveInsights([low, high, medium]).map((i) => i.id)).toEqual(["high", "medium", "low"]);
  });

  it("breaks a confidence tie with more observations first", () => {
    const fewer = insight({ id: "fewer", confidence: "medium", observation_count: 10 });
    const more = insight({ id: "more", confidence: "medium", observation_count: 20 });
    expect(rankActiveInsights([fewer, more]).map((i) => i.id)).toEqual(["more", "fewer"]);
  });
});
