import { describe, expect, it } from "vitest";

import {
  candidateStarts,
  filterUsable,
  intersection,
  mergeIntervals,
  overlaps,
  subtractIntervals,
  totalMinutes,
} from "@/lib/planner/interval";

describe("overlaps", () => {
  it("treats intervals as half-open, so back-to-back is not an overlap", () => {
    expect(overlaps({ start: 0, end: 60 }, { start: 60, end: 120 })).toBe(false);
    expect(overlaps({ start: 0, end: 61 }, { start: 60, end: 120 })).toBe(true);
  });

  it("detects containment and partial overlap in both directions", () => {
    expect(overlaps({ start: 0, end: 100 }, { start: 20, end: 40 })).toBe(true);
    expect(overlaps({ start: 20, end: 40 }, { start: 0, end: 100 })).toBe(true);
    expect(overlaps({ start: 0, end: 30 }, { start: 20, end: 50 })).toBe(true);
  });
});

describe("mergeIntervals", () => {
  it("joins overlapping and touching ranges", () => {
    expect(
      mergeIntervals([
        { start: 0, end: 30 },
        { start: 30, end: 60 },
        { start: 90, end: 120 },
      ]),
    ).toEqual([
      { start: 0, end: 60 },
      { start: 90, end: 120 },
    ]);
  });

  it("is order independent and drops empty ranges", () => {
    expect(
      mergeIntervals([
        { start: 90, end: 120 },
        { start: 50, end: 50 },
        { start: 0, end: 60 },
      ]),
    ).toEqual([
      { start: 0, end: 60 },
      { start: 90, end: 120 },
    ]);
  });
});

describe("subtractIntervals", () => {
  it("carves a block out of the middle", () => {
    expect(subtractIntervals([{ start: 0, end: 120 }], [{ start: 40, end: 60 }])).toEqual([
      { start: 0, end: 40 },
      { start: 60, end: 120 },
    ]);
  });

  it("removes a window entirely when fully covered", () => {
    expect(subtractIntervals([{ start: 0, end: 60 }], [{ start: 0, end: 60 }])).toEqual([]);
  });

  it("handles blocks that overhang both edges", () => {
    expect(subtractIntervals([{ start: 30, end: 90 }], [{ start: 0, end: 200 }])).toEqual([]);
    expect(subtractIntervals([{ start: 30, end: 90 }], [{ start: 0, end: 50 }])).toEqual([
      { start: 50, end: 90 },
    ]);
  });

  it("ignores blocks outside the window", () => {
    expect(subtractIntervals([{ start: 60, end: 120 }], [{ start: 0, end: 30 }])).toEqual([
      { start: 60, end: 120 },
    ]);
  });

  it("copes with several overlapping blocks", () => {
    expect(
      subtractIntervals(
        [{ start: 0, end: 300 }],
        [
          { start: 60, end: 120 },
          { start: 100, end: 150 },
          { start: 200, end: 220 },
        ],
      ),
    ).toEqual([
      { start: 0, end: 60 },
      { start: 150, end: 200 },
      { start: 220, end: 300 },
    ]);
  });

  it("subtracts across multiple base windows", () => {
    expect(
      subtractIntervals(
        [
          { start: 0, end: 100 },
          { start: 200, end: 300 },
        ],
        [{ start: 50, end: 250 }],
      ),
    ).toEqual([
      { start: 0, end: 50 },
      { start: 250, end: 300 },
    ]);
  });
});

describe("totalMinutes", () => {
  it("counts overlapping ranges once", () => {
    expect(
      totalMinutes([
        { start: 0, end: 60 },
        { start: 30, end: 90 },
      ]),
    ).toBe(90);
  });
});

describe("filterUsable", () => {
  it("drops gaps shorter than the minimum", () => {
    expect(
      filterUsable(
        [
          { start: 0, end: 20 },
          { start: 60, end: 150 },
        ],
        30,
      ),
    ).toEqual([{ start: 60, end: 150 }]);
  });
});

describe("candidateStarts", () => {
  it("snaps starts to the granularity grid", () => {
    expect(candidateStarts({ start: 7, end: 90 }, 30, 15)).toEqual([15, 30, 45, 60]);
  });

  it("returns nothing when the block cannot fit", () => {
    expect(candidateStarts({ start: 0, end: 20 }, 30, 15)).toEqual([]);
  });

  it("falls back to the exact window start when the grid would waste it", () => {
    // [7, 37) fits a 30-minute block only at 7; every grid point overshoots.
    expect(candidateStarts({ start: 7, end: 37 }, 30, 15)).toEqual([7]);
  });
});

describe("intersection", () => {
  it("returns the overlap or null", () => {
    expect(intersection({ start: 0, end: 60 }, { start: 30, end: 90 })).toEqual({
      start: 30,
      end: 60,
    });
    expect(intersection({ start: 0, end: 30 }, { start: 30, end: 60 })).toBeNull();
  });
});
