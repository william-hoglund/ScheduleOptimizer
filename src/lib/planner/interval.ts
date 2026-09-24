import type { EpochMinutes, Interval } from "./types";

/**
 * Interval arithmetic on half-open ranges [start, end).
 *
 * Half-open is what makes "back-to-back" work: a session ending at 10:00 and
 * one starting at 10:00 do not overlap, which is exactly right for a calendar.
 * Every overlap check in the engine relies on that.
 */

export function duration(interval: Interval): number {
  return Math.max(0, interval.end - interval.start);
}

export function isValid(interval: Interval): boolean {
  return interval.end > interval.start;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

export function intersection(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

/** Sorted by start, then end. Does not mutate the input. */
export function sortIntervals<T extends Interval>(intervals: readonly T[]): T[] {
  return [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Merges overlapping and touching intervals into the smallest equivalent set. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = sortIntervals(intervals.filter(isValid));
  const merged: Interval[] = [];

  for (const current of sorted) {
    const last = merged[merged.length - 1];
    // <= rather than < so touching intervals join: [9,10) and [10,11) become
    // [9,11), which is one continuous block of free time.
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Everything in `base` that is not covered by `blocks`.
 *
 * This is how fixed commitments carve holes out of availability.
 */
export function subtractIntervals(
  base: readonly Interval[],
  blocks: readonly Interval[],
): Interval[] {
  const busy = mergeIntervals(blocks);
  const result: Interval[] = [];

  for (const window of sortIntervals(base.filter(isValid))) {
    let cursor = window.start;

    for (const block of busy) {
      if (block.end <= cursor) continue;
      if (block.start >= window.end) break;

      if (block.start > cursor) {
        result.push({ start: cursor, end: Math.min(block.start, window.end) });
      }
      cursor = Math.max(cursor, block.end);
      if (cursor >= window.end) break;
    }

    if (cursor < window.end) {
      result.push({ start: cursor, end: window.end });
    }
  }

  return result.filter(isValid);
}

/** Total minutes covered, counting overlaps once. */
export function totalMinutes(intervals: readonly Interval[]): number {
  return mergeIntervals(intervals).reduce((sum, interval) => sum + duration(interval), 0);
}

/** Drops anything shorter than `minMinutes` — a gap too small to study in. */
export function filterUsable(intervals: readonly Interval[], minMinutes: number): Interval[] {
  return intervals.filter((interval) => duration(interval) >= minMinutes);
}

/**
 * Every start time inside `window` at which a block of `length` minutes fits,
 * stepped by `granularity`.
 *
 * Candidate starts are snapped to the grid so plans land on tidy times (09:00,
 * 09:15) instead of 09:07, and so the search space stays finite.
 */
export function candidateStarts(
  window: Interval,
  length: number,
  granularity: number,
): EpochMinutes[] {
  const starts: EpochMinutes[] = [];
  const first = Math.ceil(window.start / granularity) * granularity;

  for (let start = first; start + length <= window.end; start += granularity) {
    starts.push(start);
  }

  // A window that fits the block but whose grid-aligned starts all overshoot
  // would otherwise be wasted; offer its exact start.
  if (starts.length === 0 && duration(window) >= length) {
    starts.push(window.start);
  }

  return starts;
}
