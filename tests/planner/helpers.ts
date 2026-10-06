import { toEpochMinutes } from "@/lib/planner/time-grid";
import type {
  EpochMinutes,
  ExistingSession,
  PlannerFixedEvent,
  PlannerInput,
  PlannerPreferences,
  PlannerTask,
} from "@/lib/planner/types";

/**
 * Builders for planner tests.
 *
 * Every test states only what it cares about; everything else comes from these
 * defaults. That keeps each test readable as a sentence about behaviour rather
 * than a wall of setup.
 */

export const STOCKHOLM = "Europe/Stockholm";

/** Monday 2026-08-03, 06:00 local (04:00Z in summer). */
export const MONDAY_0600 = toEpochMinutes("2026-08-03T04:00:00.000Z");

export function at(iso: string): EpochMinutes {
  return toEpochMinutes(iso);
}

/** Local Stockholm wall-clock → epoch minutes, for readable test fixtures. */
export function local(date: string, time: string): EpochMinutes {
  // Fixed +02:00 is correct for Stockholm in August, which is when these
  // fixtures live. DST-specific tests build their own values explicitly.
  return toEpochMinutes(`${date}T${time}:00.000+02:00`);
}

export function preferences(overrides: Partial<PlannerPreferences> = {}): PlannerPreferences {
  return {
    minimumSessionMinutes: 30,
    preferredSessionMinutes: 60,
    maximumSessionMinutes: 120,
    maximumDailyMinutes: 240,
    weeklyTargetMinutes: 900,
    earliestStartTime: "08:00",
    latestEndTime: "20:00",
    preferredDays: [1, 2, 3, 4, 5],
    weekendAllowed: false,
    breakMethod: "pomodoro",
    bufferPercentage: 0,
    planningFlexibility: "balanced",
    energyProfile: { morning: "high", afternoon: "medium", evening: "low" },
    ...overrides,
  };
}

export function task(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    id: "task-1",
    courseId: "course-1",
    title: "Task",
    taskType: "assignment",
    deadline: local("2026-08-07", "17:00"),
    estimatedMinutes: 120,
    completedMinutes: 0,
    priority: 3,
    difficulty: 3,
    preferredStudyMethod: null,
    preferredSessionMinutes: null,
    coursePriority: 3,
    dependsOn: [],
    ...overrides,
  };
}

export function fixedEvent(overrides: Partial<PlannerFixedEvent> = {}): PlannerFixedEvent {
  return {
    id: "event-1",
    start: local("2026-08-03", "09:00"),
    end: local("2026-08-03", "11:00"),
    isFixed: true,
    courseId: null,
    sourceId: null,
    ...overrides,
  };
}

export function existingSession(overrides: Partial<ExistingSession> = {}): ExistingSession {
  return {
    id: "session-1",
    taskId: "task-1",
    courseId: "course-1",
    start: local("2026-08-03", "09:00"),
    end: local("2026-08-03", "10:00"),
    status: "planned",
    isLocked: false,
    manuallyModified: false,
    completedMinutes: 0,
    ...overrides,
  };
}

export function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    now: MONDAY_0600,
    seed: "test-seed",
    timeZone: STOCKHOLM,
    horizonStartDate: "2026-08-03",
    horizonEndDate: "2026-08-07",
    preferences: preferences(),
    availabilityRules: [],
    fixedEvents: [],
    calendarSources: [],
    tasks: [task()],
    existingSessions: [],
    ...overrides,
  };
}

/** True when any two sessions in the list overlap. */
export function hasOverlap(sessions: ReadonlyArray<{ start: number; end: number }>): boolean {
  const sorted = [...sessions].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (previous && current && current.start < previous.end) return true;
  }
  return false;
}
