/**
 * Two people, one engine.
 *
 * A student's week is shaped by a timetable and exams. A working professional's
 * is shaped by a job that takes the whole day and leaves evenings that are
 * already tired. Both want the same thing — study hours that survive contact
 * with the week — so the planner is identical. What differs is where the time
 * comes from, what gets measured, and what the defaults should be before anyone
 * has changed anything.
 *
 * Pure: no database, no React. The segment is one column on `profiles`.
 */

export const SEGMENTS = ["student", "professional"] as const;

export type Segment = (typeof SEGMENTS)[number];

export function isSegment(value: unknown): value is Segment {
  return typeof value === "string" && (SEGMENTS as readonly string[]).includes(value);
}

export type SegmentDefaults = {
  /** Study minutes a week, before anyone adjusts it. */
  weeklyTargetMinutes: number;
  /** A session that fits the time this person actually gets in one sitting. */
  preferredSessionMinutes: number;
  maximumDailyMinutes: number;
  /** Earliest and latest the planner may place work, wall-clock. */
  earliestStartTime: string;
  latestEndTime: string;
  /** ISO weekdays, 1 = Monday. */
  preferredDays: number[];
  weekendAllowed: boolean;
  /**
   * What a calendar is assumed to be when one is added. A professional adding a
   * calendar is almost always adding the job that eats their days.
   */
  defaultCalendarKind: "study" | "work";
  /** The number Insights leads with, because it is the one that decides the week. */
  headlineMetric: "adherence" | "protectedHours";
};

/**
 * Defaults, chosen from how each week actually goes rather than from a round
 * number. A professional gets fewer, longer, later sessions and the weekend
 * switched on, because weekday evenings after a full day are the least
 * reliable hours they have — the same finding that shaped the day rules in §12.
 */
const DEFAULTS: Record<Segment, SegmentDefaults> = {
  student: {
    weeklyTargetMinutes: 900, // 15h
    preferredSessionMinutes: 60,
    maximumDailyMinutes: 240,
    earliestStartTime: "08:00",
    latestEndTime: "20:00",
    preferredDays: [1, 2, 3, 4, 5],
    weekendAllowed: false,
    defaultCalendarKind: "study",
    headlineMetric: "adherence",
  },
  professional: {
    weeklyTargetMinutes: 360, // 6h — what survives a working week, not what sounds ambitious
    preferredSessionMinutes: 90,
    maximumDailyMinutes: 120,
    earliestStartTime: "17:30",
    latestEndTime: "22:00",
    preferredDays: [1, 2, 3, 4, 5, 6, 7],
    weekendAllowed: true,
    defaultCalendarKind: "work",
    headlineMetric: "protectedHours",
  },
};

export function defaultsFor(segment: Segment): SegmentDefaults {
  return DEFAULTS[segment];
}

/**
 * Which translation set a segment reads.
 *
 * Only the words that would be actively wrong are swapped — "courses" for
 * someone with no courses, "term" for someone with no term. Everything else
 * stays one string, because two copies of the same sentence drift apart.
 */
export function segmentKey(segment: Segment): Segment {
  return segment;
}
