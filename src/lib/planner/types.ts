/**
 * The scheduling engine's vocabulary.
 *
 * Nothing here imports Supabase, React or Next. The engine takes a plain input
 * object and returns a plain result — that is what makes it reproducible and
 * testable, and it is why `now` and `seed` are arguments rather than things the
 * engine reads for itself.
 *
 * Internally the engine works in **epoch minutes** (integers). Wall-clock and
 * daylight-saving concerns are resolved once, when availability windows are
 * built; after that every value is an absolute point on the timeline, so no
 * later step has to think about time zones.
 */

/** Absolute minutes since the Unix epoch. */
export type EpochMinutes = number;

/** Half-open interval [start, end). */
export type Interval = {
  start: EpochMinutes;
  end: EpochMinutes;
};

export type EnergyLevel = "high" | "medium" | "low";

export type StudyMethod =
  "pomodoro" | "active_recall" | "spaced_repetition" | "deep_work" | "interleaving" | "group_work";

export type TaskType =
  // Coursework
  | "assignment"
  | "exam"
  | "reading"
  | "project"
  | "lab"
  | "presentation"
  | "revision"
  | "other"
  /**
   * The rest of the week. These are scheduled exactly like coursework, because
   * they take hours out of the same week — an application closing on Friday
   * competes with revision for Thursday evening.
   */
  | "application"
  | "appointment"
  | "admin"
  | "errand";

// ------------------------------------------------------------------ input ---

export type PlannerPreferences = {
  minimumSessionMinutes: number;
  preferredSessionMinutes: number;
  maximumSessionMinutes: number;
  maximumDailyMinutes: number;
  weeklyTargetMinutes: number;
  /** Wall-clock "HH:MM" in the student's zone. */
  earliestStartTime: string;
  latestEndTime: string;
  /** ISO weekdays, 1 = Monday .. 7 = Sunday. */
  preferredDays: number[];
  weekendAllowed: boolean;
  breakMethod: "pomodoro" | "fifty_ten" | "ninety_twenty" | "none";
  /** Share of free time deliberately left empty, 0–50. */
  bufferPercentage: number;
  planningFlexibility: "strict" | "balanced" | "flexible";
  energyProfile: {
    morning: EnergyLevel;
    afternoon: EnergyLevel;
    evening: EnergyLevel;
  };
};

/** A recurring weekly rule, in wall-clock time. */
export type PlannerAvailabilityRule = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  ruleType: "available" | "unavailable" | "preferred";
};

/** Something already occupying the calendar. */
export type PlannerFixedEvent = {
  id: string;
  start: EpochMinutes;
  end: EpochMinutes;
  /** Movable events do not block study time. */
  isFixed: boolean;
  courseId: string | null;
  /** Which imported calendar it came from, if any. See PlannerCalendarSource. */
  sourceId: string | null;
};

/**
 * What a day dominated by one calendar does to study time.
 *
 * `none` blocks only the hours themselves. `reduce` and `block` are day-level:
 * eight hours at the office does not leave a usable evening, however much free
 * space the calendar shows. Which is why it is a threshold and not a flag — a
 * 45-minute stand-up is an ordinary hole in the day and must stay one.
 */
export type DayEffect = "none" | "reduce" | "block";

export type PlannerCalendarSource = {
  id: string;
  dayEffect: DayEffect;
  /** Minutes of this calendar's events on one local day before the effect applies. */
  thresholdMinutes: number;
  /** Study minutes left on an affected day when the effect is `reduce`. */
  reducedDailyMinutes: number;
};

export type PlannerTask = {
  id: string;
  courseId: string | null;
  title: string;
  taskType: TaskType;
  /** Absent means "no deadline"; such tasks are scheduled only after dated work. */
  deadline: EpochMinutes | null;
  estimatedMinutes: number;
  completedMinutes: number;
  /** 1–5. */
  priority: number;
  difficulty: number;
  preferredStudyMethod: StudyMethod | null;
  /** Overrides `preferences.preferredSessionMinutes` for this task alone. Null means "use the usual preference". */
  preferredSessionMinutes: number | null;
  /** No session may start before this. Null/absent means "any time from now". */
  notBefore?: EpochMinutes | null;
  /** Course-level weight, 1–5. */
  coursePriority: number;
  /** Task ids that must be finished first. */
  dependsOn: string[];
};

/**
 * A session that already exists and must survive regeneration.
 *
 * Completed work is history. Locked and manually-moved sessions are the
 * student's explicit decisions, and the brief is firm that regeneration must
 * not quietly undo them.
 */
export type ExistingSession = {
  id: string;
  taskId: string | null;
  courseId: string | null;
  start: EpochMinutes;
  end: EpochMinutes;
  status: "planned" | "completed" | "missed" | "partial" | "cancelled";
  isLocked: boolean;
  manuallyModified: boolean;
  completedMinutes: number;
};

export type PlannerInput = {
  /** Absolute "now". Never read from the system clock inside the engine. */
  now: EpochMinutes;
  /** Any string. The same seed and input always produce the same plan. */
  seed: string;
  timeZone: string;
  /** Local calendar dates, inclusive, "YYYY-MM-DD". */
  horizonStartDate: string;
  horizonEndDate: string;
  preferences: PlannerPreferences;
  availabilityRules: PlannerAvailabilityRule[];
  fixedEvents: PlannerFixedEvent[];
  /** Imported calendars, for the day-level rules their events carry. */
  calendarSources: PlannerCalendarSource[];
  tasks: PlannerTask[];
  existingSessions: ExistingSession[];
};

// ----------------------------------------------------------------- output ---

export type PlannedSession = {
  taskId: string | null;
  courseId: string | null;
  title: string;
  start: EpochMinutes;
  end: EpochMinutes;
  minutes: number;
  method: StudyMethod;
  /** Why the engine put it here, in a form the UI and the AI layer can render. */
  reason: SessionReason;
  /** True for sessions carried over from the previous plan, not newly placed. */
  preserved: boolean;
  isLocked: boolean;
};

export type SessionReason = {
  /** Machine-readable so the UI can translate it. */
  code:
    | "deadline_pressure"
    | "high_energy_match"
    | "preferred_time"
    | "spaced_repetition"
    | "spread_before_deadline"
    | "first_available"
    | "preserved_locked"
    | "preserved_manual"
    | "preserved_completed";
  /** Values the translated sentence needs. */
  details?: Record<string, string | number>;
};

export type PlannerWarning = {
  code:
    | "not_enough_time"
    | "task_at_risk"
    | "task_unschedulable"
    | "deadline_passed"
    | "no_availability"
    | "over_daily_limit"
    | "dependency_cycle"
    | "horizon_too_short"
    /** Whole days went to work or other commitments. */
    | "days_taken_by_commitments";
  severity: "info" | "warning" | "critical";
  taskId?: string;
  details?: Record<string, string | number>;
};

/** A concrete thing the student could change to make an infeasible plan fit. */
export type PlannerRemedy = {
  code:
    | "increase_available_time"
    | "allow_weekends"
    | "extend_daily_limit"
    | "reduce_scope"
    | "prioritise_graded"
    | "start_earlier"
    | "ask_for_extension"
    /** The student can soften a calendar's day rule if it is too blunt. */
    | "relax_day_rule";
  details?: Record<string, string | number>;
};

export type FeasibilityReport = {
  requiredMinutes: number;
  availableMinutes: number;
  /** After the buffer is set aside. */
  usableMinutes: number;
  feasible: boolean;
  shortfallMinutes: number;
  atRiskTaskIds: string[];
  remedies: PlannerRemedy[];
};

export type PlanQuality = {
  /** 0–1. Share of needed work actually placed. */
  coverage: number;
  /** 0–1. How well placements matched soft preferences. */
  preferenceFit: number;
  /** Days in the horizon with at least one session. */
  activeDays: number;
  /** Longest run of days with no study at all. */
  longestGapDays: number;
  totalPlannedMinutes: number;
};

export type PlannerResult = {
  sessions: PlannedSession[];
  warnings: PlannerWarning[];
  feasibility: FeasibilityReport;
  quality: PlanQuality;
  /** Per task: how much got placed versus how much was needed. */
  taskCoverage: Array<{
    taskId: string;
    neededMinutes: number;
    scheduledMinutes: number;
  }>;
  algorithmVersion: string;
};

export const ALGORITHM_VERSION = "v1.0.0";
