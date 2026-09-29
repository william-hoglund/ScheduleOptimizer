import { describe, expect, it } from "vitest";

import { pickRecommendation } from "@/lib/briefing/pick-recommendation";
import type { HorizonForecast } from "@/lib/intelligence/workload-forecast";

function forecast(overrides: Partial<HorizonForecast> = {}): HorizonForecast {
  return {
    horizonDays: 7,
    requiredMinutes: 100,
    availableMinutes: 200,
    shortfallMinutes: 0,
    pressure: "normal",
    mainReason: null,
    remedies: [],
    ...overrides,
  };
}

describe("pickRecommendation", () => {
  it("returns null when there is no forecast at all", () => {
    expect(pickRecommendation(null)).toBeNull();
  });

  it("returns null for a feasible week with no remedies", () => {
    expect(pickRecommendation(forecast({ remedies: [] }))).toBeNull();
  });

  it("leads with the first remedy when several exist", () => {
    const remedies: HorizonForecast["remedies"] = [
      { code: "allow_weekends" },
      { code: "increase_available_time", details: { hours: 3 } },
    ];
    expect(pickRecommendation(forecast({ remedies }))?.code).toBe("allow_weekends");
  });
});
