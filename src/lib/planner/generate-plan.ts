import { capacityWithDayCaps } from "./availability/apply-day-effects";
import { buildAvailability } from "./availability/build-availability";
import { findConflicts, violatesHardConstraint } from "./constraints/hard-constraints";
import { assessFeasibility } from "./feasibility/assess-feasibility";
import { candidateStarts, subtractIntervals } from "./interval";
import { createRandom } from "./random";
import { scoreSlot } from "./scoring/score-slot";
import {
  analyseDependencies,
  calculateTaskUrgency,
  remainingMinutesFor,
  type TaskPriority,
} from "./tasks/calculate-task-urgency";
import { phaseChunks } from "./tasks/session-phases";
import { splitTaskIntoSessions, type SessionChunk } from "./tasks/split-task-into-sessions";
import { epochMinutesToLocalDate, localDatesInRange, localToEpochMinutes } from "./time-grid";
import {
  ALGORITHM_VERSION,
  type Interval,
  type PlannedSession,
  type PlannerInput,
  type PlannerResult,
  type PlannerTask,
  type PlannerWarning,
  type PlanQuality,
} from "./types";

/**
 * Generates a study plan.
 *
 * Pure: same input and seed in, same plan out, every time. It reads no clock,
 * touches no database, and imports nothing from React or Supabase.
 *
 * Shape of the algorithm:
 *   1. preserve what must survive (completed, locked, manually moved)
 *   2. build availability, minus fixed events and everything already preserved
 *   3. work out what each task still needs, and whether it can fit at all
 *   4. split tasks into sessions sized for the kind of work they are
 *   5. place them greedily, most urgent task first, best-scoring slot first
 *   6. validate the finished plan and report anything wrong
 *
 * Greedy rather than a global optimiser: it is predictable, fast enough to run
 * on every keystroke of the planner form, and — most importantly — explainable.
 * A student can be told why a session is where it is.
 */

/** Candidate start times are snapped to this grid, so plans land on tidy times. */
const SLOT_GRANULARITY_MINUTES = 15;

/** Cap on candidate slots examined per chunk, to bound the search. */
const MAX_CANDIDATES_PER_CHUNK = 400;

/** How much the seed may nudge a slot's score. See its use in `placeChunk`. */
const SEED_JITTER = 2;

export function generatePlan(input: PlannerInput): PlannerResult {
  const warnings: PlannerWarning[] = [];
  const random = createRandom(input.seed);
  const { preferences, timeZone, now } = input;

  const horizonEnd = localToEpochMinutes(input.horizonEndDate, "23:59", timeZone) ?? now + 7 * 1440;

  // --- 1. preserve ---------------------------------------------------------
  const preserved = preserveSessions(input);
  const preservedIntervals: Interval[] = preserved.map((session) => ({
    start: session.start,
    end: session.end,
  }));

  // --- 2. availability -----------------------------------------------------
  const availability = buildAvailability({
    horizonStartDate: input.horizonStartDate,
    horizonEndDate: input.horizonEndDate,
    timeZone,
    preferences,
    availabilityRules: input.availabilityRules,
    fixedEvents: input.fixedEvents,
    calendarSources: input.calendarSources,
    now,
  });

  /**
   * Days an imported calendar has taken. Said out loud rather than left as a
   * mysteriously empty Tuesday — the student chose this rule, and should see it
   * working.
   */
  const blockedDays = new Set(
    availability.dayEffects.filter((e) => e.effect === "block").map((e) => e.date),
  );
  const reducedDays = new Set(
    availability.dayEffects.filter((e) => e.effect === "reduce").map((e) => e.date),
  );
  if (blockedDays.size > 0 || reducedDays.size > 0) {
    warnings.push({
      code: "days_taken_by_commitments",
      severity: "info",
      details: { blocked: blockedDays.size, reduced: reducedDays.size },
    });
  }

  // Preserved sessions occupy real time, so they are removed from what is free.
  const freeWindows = subtractIntervals(availability.windows, preservedIntervals);

  if (freeWindows.length === 0) {
    warnings.push({ code: "no_availability", severity: "critical" });
  }

  // --- 3. what is needed, and does it fit ----------------------------------
  const openTasks = input.tasks.filter((task) => remainingMinutesFor(task) > 0);

  const { blockedByCount, cycleTaskIds } = analyseDependencies(openTasks);
  if (cycleTaskIds.length > 0) {
    warnings.push({
      code: "dependency_cycle",
      severity: "warning",
      details: { count: cycleTaskIds.length },
    });
  }

  for (const task of openTasks) {
    if (task.deadline !== null && task.deadline < now) {
      warnings.push({ code: "deadline_passed", severity: "warning", taskId: task.id });
    }
  }

  /**
   * Capacity, honestly. A reduced day still has hours on the clock, so summing
   * windows would promise time the student has already said they will not use —
   * and the feasibility report would then call an impossible week fine.
   */
  const availableMinutes = capacityWithDayCaps(freeWindows, availability.dailyCapByDate, timeZone);
  const feasibility = assessFeasibility({
    tasks: openTasks,
    availableMinutes,
    preferences,
    now,
    horizonEnd,
  });

  if (!feasibility.feasible) {
    warnings.push({
      code: "not_enough_time",
      severity: "critical",
      details: {
        requiredMinutes: feasibility.requiredMinutes,
        usableMinutes: feasibility.usableMinutes,
        shortfallMinutes: feasibility.shortfallMinutes,
      },
    });
  }

  for (const taskId of feasibility.atRiskTaskIds) {
    warnings.push({ code: "task_at_risk", severity: "warning", taskId });
  }

  // --- 4. prioritise and split --------------------------------------------
  const priorities = new Map<string, TaskPriority>();
  for (const task of openTasks) {
    priorities.set(
      task.id,
      calculateTaskUrgency(task, {
        now,
        bufferPercentage: preferences.bufferPercentage,
        maximumDailyMinutes: preferences.maximumDailyMinutes,
        blockedByCount: blockedByCount.get(task.id) ?? 0,
      }),
    );
  }

  // Highest priority first. Ties broken by id so the order is stable rather
  // than dependent on the caller's array order.
  const ordered = [...openTasks].sort((a, b) => {
    const diff = (priorities.get(b.id)?.total ?? 0) - (priorities.get(a.id)?.total ?? 0);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  // --- 5. place ------------------------------------------------------------
  const placed: PlannedSession[] = [...preserved];
  const minutesByDate = new Map<string, number>();

  // Preserved work counts against the daily cap; it is real time already spent.
  for (const session of preserved) {
    const date = epochMinutesToLocalDate(session.start, timeZone);
    minutesByDate.set(date, (minutesByDate.get(date) ?? 0) + session.minutes);
  }

  const scheduledByTask = new Map<string, number>();

  /**
   * How much work a day should carry, on average, to finish the outstanding
   * work across the days actually available. Used by the scorer to spread a
   * week out instead of front-loading it.
   */
  const totalRemaining = openTasks.reduce((sum, t) => sum + remainingMinutesFor(t), 0);
  const availableDayCount = Math.max(1, availability.minutesByDate.size);
  const dailyPaceTarget = Math.min(
    preferences.maximumDailyMinutes,
    Math.max(preferences.minimumSessionMinutes, Math.ceil(totalRemaining / availableDayCount)),
  );

  for (const task of ordered) {
    const priority = priorities.get(task.id);
    if (!priority) continue;

    const urgent = priority.daysUntilTarget !== null && priority.daysUntilTarget <= 3;
    const { chunks, introNotBefore } = phaseChunks(
      task,
      splitTaskIntoSessions(task, priority.remainingMinutes, preferences, { urgent }),
      now,
      preferences.minimumSessionMinutes,
    );
    // The intro waits until about two weeks out; everything after it waits
    // for the intro, so "get started" really comes first.
    let introEnd: number | null = null;

    for (const chunk of chunks) {
      const floor =
        chunk.phase === "intro"
          ? Math.max(task.notBefore ?? -Infinity, introNotBefore ?? -Infinity)
          : Math.max(task.notBefore ?? -Infinity, introEnd ?? -Infinity);
      const placed_ = placeChunk({
        task: { ...task, notBefore: Number.isFinite(floor) ? floor : (task.notBefore ?? null) },
        chunk,
        priority,
        dailyCapByDate: availability.dailyCapByDate,
        freeWindows,
        placed,
        minutesByDate,
        input,
        random,
        preferredWindows: availability.preferredWindows,
        dailyPaceTarget,
      });

      if (!placed_) break; // No room left for this task; later chunks will not fit either.
      const session: PlannedSession = chunk.phase
        ? {
            ...placed_,
            phase: chunk.phase,
            reason: { ...placed_.reason, details: { ...placed_.reason.details, phase: chunk.phase } },
          }
        : placed_;
      if (chunk.phase === "intro") introEnd = session.end;

      placed.push(session);
      const date = epochMinutesToLocalDate(session.start, timeZone);
      minutesByDate.set(date, (minutesByDate.get(date) ?? 0) + session.minutes);
      scheduledByTask.set(task.id, (scheduledByTask.get(task.id) ?? 0) + session.minutes);
    }
  }

  // --- 5b. join back-to-back blocks of the same task -----------------------
  // Placement works in chunks, which can land as 8:45, 9:30, 10:15 for one
  // task — three entries where the student sees one sitting. Joined when the
  // gap is short and is itself free time (so nothing, like a class, is inside).
  const joined = joinAdjacentSessions(placed, availability.windows);
  placed.length = 0;
  placed.push(...joined);

  // --- 6. validate ---------------------------------------------------------
  const deadlinesByTask = new Map<string, number | null>(
    openTasks.map((task) => [task.id, task.deadline]),
  );

  const conflicts = findConflicts(placed, {
    windows: availability.windows,
    timeZone,
    preferences,
    deadlinesByTask,
  });

  for (const conflict of conflicts) {
    // Reaching here means the placement loop has a bug. The plan is still
    // returned — with a loud warning — rather than thrown away.
    warnings.push({
      code: conflict.code === "daily_limit" ? "over_daily_limit" : "task_unschedulable",
      severity: "critical",
      details: { conflict: conflict.code, ...conflict.details },
    });
  }

  const taskCoverage = openTasks.map((task) => ({
    taskId: task.id,
    neededMinutes: remainingMinutesFor(task),
    scheduledMinutes: scheduledByTask.get(task.id) ?? 0,
  }));

  for (const coverage of taskCoverage) {
    if (coverage.scheduledMinutes === 0 && coverage.neededMinutes > 0) {
      warnings.push({ code: "task_unschedulable", severity: "warning", taskId: coverage.taskId });
    }
  }

  const newlyPlaced = placed.filter((session) => !session.preserved);

  return {
    sessions: [...placed].sort((a, b) => a.start - b.start),
    warnings,
    feasibility,
    quality: measureQuality({
      sessions: newlyPlaced,
      taskCoverage,
      input,
    }),
    taskCoverage,
    algorithmVersion: ALGORITHM_VERSION,
  };
}

/**
 * Sessions carried over untouched.
 *
 * Completed work is history. Locked sessions and ones the student dragged
 * somewhere themselves are explicit decisions — the brief is firm that
 * regeneration must not quietly undo either.
 */
function preserveSessions(input: PlannerInput): PlannedSession[] {
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));

  return input.existingSessions
    .filter((session) => {
      if (session.status === "cancelled") return false;
      if (session.status === "completed" || session.status === "partial") return true;
      if (session.isLocked || session.manuallyModified) return true;
      // An ordinary planned session in the future is fair game to re-place.
      return false;
    })
    .map((session) => {
      const task = session.taskId ? taskById.get(session.taskId) : undefined;
      const code =
        session.status === "completed" || session.status === "partial"
          ? "preserved_completed"
          : session.isLocked
            ? "preserved_locked"
            : "preserved_manual";

      return {
        taskId: session.taskId,
        courseId: session.courseId ?? task?.courseId ?? null,
        title: task?.title ?? "",
        start: session.start,
        end: session.end,
        minutes: Math.max(0, session.end - session.start),
        method: task?.preferredStudyMethod ?? "pomodoro",
        reason: { code },
        preserved: true,
        isLocked: session.isLocked,
      } satisfies PlannedSession;
    });
}

/** Finds the best legal slot for one chunk, or null if there is none. */
function placeChunk({
  task,
  chunk,
  priority,
  freeWindows,
  placed,
  minutesByDate,
  dailyCapByDate,
  input,
  random,
  preferredWindows,
  dailyPaceTarget,
}: {
  task: PlannerTask;
  chunk: SessionChunk;
  priority: TaskPriority;
  freeWindows: readonly Interval[];
  placed: readonly PlannedSession[];
  minutesByDate: ReadonlyMap<string, number>;
  /** Per-date caps from a calendar's day rule. Empty on an ordinary week. */
  dailyCapByDate: ReadonlyMap<string, number>;
  input: PlannerInput;
  random: () => number;
  preferredWindows: readonly Interval[];
  dailyPaceTarget: number;
}): PlannedSession | null {
  const { preferences, timeZone, now } = input;
  const placedIntervals = placed.map((session) => ({ start: session.start, end: session.end }));

  // The chunk must finish before the task's own deadline, not merely inside the
  // horizon.
  const deadline = task.deadline;

  let best: { session: PlannedSession; score: number } | null = null;
  let examined = 0;

  for (const window of freeWindows) {
    if (examined >= MAX_CANDIDATES_PER_CHUNK) break;
    if (deadline !== null && window.start >= deadline) continue;
    if (task.notBefore != null && window.end <= task.notBefore) continue;

    for (const start of candidateStarts(window, chunk.minutes, SLOT_GRANULARITY_MINUTES)) {
      if (examined >= MAX_CANDIDATES_PER_CHUNK) break;
      examined += 1;

      const candidate: Interval = { start, end: start + chunk.minutes };

      const violation = violatesHardConstraint(candidate, {
        context: {
          now,
          timeZone,
          preferences,
          windows: freeWindows,
          placed: placedIntervals,
          minutesByDate,
          dailyCapByDate,
        },
        deadline,
        notBefore: task.notBefore ?? null,
      });
      if (violation !== null) continue;

      const { score, reason } = scoreSlot(candidate, task, {
        targetDeadline: priority.targetDeadline,
        chunkIndex: chunk.index,
        totalChunks: chunk.totalChunks,
        context: {
          now,
          timeZone,
          preferences,
          preferredWindows,
          placed,
          minutesByDate,
          window,
          dailyPaceTarget,
        },
      });

      // Seeded jitter, sized to flip near-ties but not to override a genuine
      // preference. Scores run to roughly 90, so this is a few percent of noise.
      //
      // It has to be big enough to matter: a seed that never changes the result
      // is a seed that cannot produce the "show me an alternative" plan the
      // planner offers. Same seed in, same nudge out — so the plan stays
      // reproducible.
      const jittered = score + random() * SEED_JITTER;

      if (!best || jittered > best.score) {
        best = {
          score: jittered,
          session: {
            taskId: task.id,
            courseId: task.courseId,
            title: task.title,
            start: candidate.start,
            end: candidate.end,
            minutes: chunk.minutes,
            method: chunk.method,
            reason,
            preserved: false,
            isLocked: false,
          },
        };
      }
    }
  }

  return best?.session ?? null;
}

function measureQuality({
  sessions,
  taskCoverage,
  input,
}: {
  sessions: readonly PlannedSession[];
  taskCoverage: ReadonlyArray<{ neededMinutes: number; scheduledMinutes: number }>;
  input: PlannerInput;
}): PlanQuality {
  const needed = taskCoverage.reduce((sum, task) => sum + task.neededMinutes, 0);
  const scheduled = taskCoverage.reduce((sum, task) => sum + task.scheduledMinutes, 0);

  const activeDates = new Set(
    sessions.map((session) => epochMinutesToLocalDate(session.start, input.timeZone)),
  );

  const horizonDates = localDatesInRange(input.horizonStartDate, input.horizonEndDate);
  let longestGapDays = 0;
  let currentGap = 0;
  for (const date of horizonDates) {
    if (activeDates.has(date)) {
      currentGap = 0;
    } else {
      currentGap += 1;
      longestGapDays = Math.max(longestGapDays, currentGap);
    }
  }

  // How often the engine got what it wanted, rather than settling.
  const goodReasons = sessions.filter(
    (session) =>
      session.reason.code === "high_energy_match" ||
      session.reason.code === "preferred_time" ||
      session.reason.code === "spaced_repetition",
  ).length;

  return {
    coverage: needed === 0 ? 1 : Math.min(1, scheduled / needed),
    preferenceFit: sessions.length === 0 ? 0 : goodReasons / sessions.length,
    activeDays: activeDates.size,
    longestGapDays,
    totalPlannedMinutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
  };
}

/** The longest a joined block may become. */
const MAX_JOINED_MINUTES = 180;
/** Gaps up to this are joined; they become a break inside the block. */
const MAX_JOIN_GAP_MINUTES = 15;

export function joinAdjacentSessions(
  sessions: readonly PlannedSession[],
  windows: readonly Interval[],
): PlannedSession[] {
  const sorted = [...sessions].sort((a, b) => a.start - b.start);
  const result: PlannedSession[] = [];

  for (const session of sorted) {
    const previous = result[result.length - 1];
    const gap = previous ? session.start - previous.end : Infinity;
    const canJoin =
      previous !== undefined &&
      !previous.preserved &&
      !session.preserved &&
      !previous.isLocked &&
      !session.isLocked &&
      previous.taskId !== null &&
      previous.taskId === session.taskId &&
      // Phases stay separate sessions: "get started" is its own sitting.
      (previous.phase ?? null) === (session.phase ?? null) &&
      gap >= 0 &&
      gap <= MAX_JOIN_GAP_MINUTES &&
      session.end - previous.start <= MAX_JOINED_MINUTES &&
      (gap === 0 || windows.some((w) => w.start <= previous.end && session.start <= w.end));

    if (canJoin && previous) {
      result[result.length - 1] = {
        ...previous,
        end: session.end,
        minutes: previous.minutes + session.minutes,
      };
    } else {
      result.push(session);
    }
  }

  return result;
}
