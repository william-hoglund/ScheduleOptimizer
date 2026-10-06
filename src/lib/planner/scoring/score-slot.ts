import { overlaps } from "../interval";
import { MINUTES_PER_DAY, epochMinutesToLocalDate, minutesIntoLocalDay } from "../time-grid";
import type {
  EnergyLevel,
  EpochMinutes,
  Interval,
  PlannerPreferences,
  PlannerTask,
  SessionReason,
} from "../types";

/**
 * How good a particular time is for a particular piece of work.
 *
 * Positive terms are things we want; penalties are things we tolerate only when
 * there is nothing better. The engine picks the highest score, so the weights
 * here are what actually shapes a plan's character.
 *
 * The dominant reason is returned alongside the score, so the plan can explain
 * itself without a second pass of guesswork.
 */

export type SlotScore = {
  score: number;
  reason: SessionReason;
};

const WEIGHTS = {
  deadlineFit: 30,
  energyFit: 18,
  preferenceFit: 12,
  sessionLengthFit: 10,
  spacingFit: 14,
  continuityFit: 8,
  contextSwitchPenalty: 10,
  overloadPenalty: 22,
  fragmentationPenalty: 12,
  lateStudyPenalty: 16,
} as const;

const ENERGY_VALUE: Record<EnergyLevel, number> = { high: 1, medium: 0.6, low: 0.25 };

function energyAt(minutesIntoDay: number, preferences: PlannerPreferences): EnergyLevel {
  if (minutesIntoDay < 12 * 60) return preferences.energyProfile.morning;
  if (minutesIntoDay < 17 * 60) return preferences.energyProfile.afternoon;
  return preferences.energyProfile.evening;
}

export type SlotContext = {
  now: EpochMinutes;
  timeZone: string;
  preferences: PlannerPreferences;
  preferredWindows: readonly Interval[];
  /** Sessions already placed, for spacing and context-switch checks. */
  placed: readonly {
    start: EpochMinutes;
    end: EpochMinutes;
    taskId: string | null;
    courseId: string | null;
  }[];
  minutesByDate: ReadonlyMap<string, number>;
  /** The free window this candidate sits inside. */
  window: Interval;
  /**
   * Roughly how many minutes a day *should* carry, given the work outstanding
   * and the days available. Without it, the deadline term front-loads
   * everything into the first days and leaves the run-up to an exam empty.
   */
  dailyPaceTarget: number;
};

export function scoreSlot(
  candidate: Interval,
  task: PlannerTask,
  {
    targetDeadline,
    chunkIndex,
    totalChunks,
    context,
  }: {
    targetDeadline: EpochMinutes | null;
    chunkIndex: number;
    totalChunks: number;
    context: SlotContext;
  },
): SlotScore {
  const { preferences, timeZone } = context;
  const length = candidate.end - candidate.start;
  const minutesIntoDay = minutesIntoLocalDay(candidate.start, timeZone);
  const date = epochMinutesToLocalDate(candidate.start, timeZone);

  // --- deadline fit --------------------------------------------------------
  // Earlier is better, but only relative to the time actually available. A slot
  // halfway to the deadline scores 0.5; one right against it scores near 0.
  let deadlineFit = 0.5;
  if (targetDeadline !== null) {
    const total = Math.max(1, targetDeadline - context.now);
    const used = Math.max(0, candidate.start - context.now);
    deadlineFit = Math.min(1, Math.max(0, 1 - used / total));
  }

  // --- energy fit ----------------------------------------------------------
  // Difficult work wants high-energy hours; easy work does not care, so the
  // match matters in proportion to difficulty.
  const energy = ENERGY_VALUE[energyAt(minutesIntoDay, preferences)];
  const difficultyWeight = task.difficulty / 5;
  const energyFit = energy * difficultyWeight + (1 - difficultyWeight) * 0.5;

  // --- explicit preference -------------------------------------------------
  const preferenceFit = context.preferredWindows.some((window) => overlaps(window, candidate))
    ? 1
    : 0;

  // --- session length ------------------------------------------------------
  // How close this block is to the length the student asked for — this
  // task's own override when it has one, the account-wide default otherwise.
  const preferred = task.preferredSessionMinutes ?? preferences.preferredSessionMinutes;
  const sessionLengthFit = 1 - Math.min(1, Math.abs(length - preferred) / Math.max(1, preferred));

  // --- spacing -------------------------------------------------------------
  // Later chunks of the same task should not pile onto the same day. Revision
  // in particular works better spread out.
  const sameTaskSameDay = context.placed.filter(
    (session) =>
      session.taskId === task.id && epochMinutesToLocalDate(session.start, timeZone) === date,
  ).length;
  const spacingFit = totalChunks > 1 ? Math.max(0, 1 - sameTaskSameDay * 0.5) : 0.5;

  // --- continuity ----------------------------------------------------------
  // A session adjacent to existing work makes a coherent day rather than
  // scattering single blocks across empty hours.
  const adjacent = context.placed.some(
    (session) =>
      Math.abs(session.end - candidate.start) <= 30 ||
      Math.abs(candidate.end - session.start) <= 30,
  );
  const continuityFit = adjacent ? 1 : 0.35;

  // --- context switching ---------------------------------------------------
  // Bouncing between courses within a day costs real focus.
  const distinctCoursesToday = new Set(
    context.placed
      .filter((session) => epochMinutesToLocalDate(session.start, timeZone) === date)
      .map((session) => session.courseId)
      .filter((courseId): courseId is string => courseId !== null),
  );
  const introducesSwitch =
    task.courseId !== null &&
    !distinctCoursesToday.has(task.courseId) &&
    distinctCoursesToday.size >= 2;
  const contextSwitchPenalty = introducesSwitch ? 1 : 0;

  // --- overload ------------------------------------------------------------
  // Two separate pressures, because they answer different questions.
  //
  // "Is this day getting close to the student's hard limit?" — discouraged well
  // before the cap, so a day is never filled to the brim just because it legally
  // could be.
  const committed = context.minutesByDate.get(date) ?? 0;
  const load = (committed + length) / Math.max(1, preferences.maximumDailyMinutes);
  const capPressure = Math.max(0, load - 0.7) / 0.3;

  // "Is this day taking more than its fair share of the work left?" — this is
  // what spreads a week out. Some overshoot is allowed, since finishing ahead of
  // a deadline is genuinely good; past that the day starts to look like cramming.
  const pace = (committed + length) / Math.max(1, context.dailyPaceTarget);
  const pacePressure = Math.max(0, pace - 1.3) / 1.5;

  const overloadPenalty = Math.min(2, capPressure + pacePressure);

  // --- fragmentation -------------------------------------------------------
  // Leaving an unusable sliver at either end of a window wastes it.
  const leftRemainder = candidate.start - context.window.start;
  const rightRemainder = context.window.end - candidate.end;
  const wastes = (remainder: number) =>
    remainder > 0 && remainder < preferences.minimumSessionMinutes ? 1 : 0;
  const fragmentationPenalty = Math.min(1, (wastes(leftRemainder) + wastes(rightRemainder)) / 2);

  // --- late study ----------------------------------------------------------
  // Anything ending after 21:00 local is discouraged; the brief is explicit
  // that the product must not push students into unsustainable hours.
  const endsInto = minutesIntoDay + length;
  const lateStudyPenalty = Math.min(1, Math.max(0, (endsInto - 21 * 60) / 120));

  const score =
    deadlineFit * WEIGHTS.deadlineFit +
    energyFit * WEIGHTS.energyFit +
    preferenceFit * WEIGHTS.preferenceFit +
    sessionLengthFit * WEIGHTS.sessionLengthFit +
    spacingFit * WEIGHTS.spacingFit +
    continuityFit * WEIGHTS.continuityFit -
    contextSwitchPenalty * WEIGHTS.contextSwitchPenalty -
    overloadPenalty * WEIGHTS.overloadPenalty -
    fragmentationPenalty * WEIGHTS.fragmentationPenalty -
    lateStudyPenalty * WEIGHTS.lateStudyPenalty;

  return {
    score,
    reason: dominantReason({
      deadlineFit,
      energyFit,
      preferenceFit,
      spacingFit,
      chunkIndex,
      totalChunks,
      targetDeadline,
      context,
      candidate,
    }),
  };
}

/**
 * The single most useful thing to tell the student about this placement.
 *
 * Chosen by which positive term contributed most, not by re-deriving anything.
 */
function dominantReason({
  deadlineFit,
  energyFit,
  preferenceFit,
  spacingFit,
  totalChunks,
  targetDeadline,
  context,
  candidate,
}: {
  deadlineFit: number;
  energyFit: number;
  preferenceFit: number;
  spacingFit: number;
  chunkIndex: number;
  totalChunks: number;
  targetDeadline: EpochMinutes | null;
  context: SlotContext;
  candidate: Interval;
}): SessionReason {
  const contributions: Array<{ code: SessionReason["code"]; value: number }> = [
    { code: "deadline_pressure", value: deadlineFit * WEIGHTS.deadlineFit },
    { code: "high_energy_match", value: energyFit * WEIGHTS.energyFit },
    { code: "preferred_time", value: preferenceFit * WEIGHTS.preferenceFit },
    { code: "spread_before_deadline", value: spacingFit * WEIGHTS.spacingFit },
  ];

  const best = contributions.reduce((a, b) => (b.value > a.value ? b : a));

  if (best.code === "spread_before_deadline" && totalChunks > 2) {
    return { code: "spaced_repetition", details: { parts: totalChunks } };
  }

  if (best.code === "deadline_pressure") {
    // With no deadline there is no "slack left" to report, and claiming there
    // is would be a lie. The honest reason is simply that this was the best
    // slot available.
    if (targetDeadline === null) return { code: "first_available" };

    const daysLeft = Math.max(0, Math.round((targetDeadline - candidate.end) / MINUTES_PER_DAY));
    return { code: "deadline_pressure", details: { daysLeft } };
  }

  if (best.code === "high_energy_match") {
    const hour = Math.floor(minutesIntoLocalDay(candidate.start, context.timeZone) / 60);
    return { code: "high_energy_match", details: { hour } };
  }

  return { code: best.code };
}
