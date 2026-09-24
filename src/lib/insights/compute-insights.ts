import {
  minutesIntoLocalDay,
  epochMinutesToLocalDate,
  toEpochMinutes,
} from "@/lib/planner/time-grid";

/**
 * Study statistics.
 *
 * Pure, like the planner engine, so it can be tested without a database.
 *
 * The brief asks for statistics that do not create performance anxiety, and
 * that rules out most of what a dashboard would normally show. Two decisions
 * follow from it:
 *
 *   - **Adherence is measured against what was planned, not against some ideal.**
 *     A student who plans four hours and does four hours is at 100%, the same as
 *     one who plans twenty and does twenty. Planning less is not failing.
 *   - **Nothing is reported without enough data to mean anything.** A "most
 *     productive time" derived from two sessions is noise dressed as insight,
 *     so those fields stay null until there is a real signal.
 */

export type InsightSession = {
  startAt: string;
  endAt: string;
  plannedMinutes: number;
  completedMinutes: number;
  status: "planned" | "completed" | "missed" | "partial" | "cancelled";
  courseId: string | null;
  /** True when the session was created by a reschedule rather than a plan. */
  wasRescheduled: boolean;
};

export type InsightTask = {
  id: string;
  courseId: string | null;
  title: string;
  deadline: string | null;
  estimatedMinutes: number;
  completedMinutes: number;
  status: string;
};

export type TimeOfDayBand = "morning" | "afternoon" | "evening";

export type CourseAtRisk = {
  courseId: string | null;
  remainingMinutes: number;
  minutesUntilDeadline: number;
  /** Remaining work as a share of the time left. Above 1 is not achievable. */
  pressure: number;
  taskTitle: string;
};

export type Insights = {
  /** Sessions whose time has passed, which is what everything else is based on. */
  consideredSessions: number;
  plannedMinutes: number;
  completedMinutes: number;
  /** 0–1, or null when nothing has been planned yet. */
  adherence: number | null;
  /** Null until there are enough finished sessions to mean anything. */
  bestBand: TimeOfDayBand | null;
  bandCompletion: Record<TimeOfDayBand, { planned: number; completed: number }>;
  averageSessionMinutes: number | null;
  rescheduledCount: number;
  missedCount: number;
  completedCount: number;
  coursesAtRisk: CourseAtRisk[];
  /** Work still to do before the next deadline, whenever that is. */
  workloadBeforeNextDeadline: {
    deadline: string | null;
    remainingMinutes: number;
  };
};

/** Below this, per-band figures are noise rather than a pattern. */
const MIN_SESSIONS_FOR_A_PATTERN = 6;

function bandFor(minutesIntoDay: number): TimeOfDayBand {
  if (minutesIntoDay < 12 * 60) return "morning";
  if (minutesIntoDay < 17 * 60) return "afternoon";
  return "evening";
}

export function computeInsights({
  sessions,
  tasks,
  nowIso,
  timeZone,
}: {
  sessions: readonly InsightSession[];
  tasks: readonly InsightTask[];
  nowIso: string;
  timeZone: string;
}): Insights {
  const now = toEpochMinutes(nowIso);

  // Only sessions that have actually happened. Counting future ones as "not
  // done" would make every student look like they are failing.
  const past = sessions.filter(
    (session) => toEpochMinutes(session.endAt) <= now && session.status !== "cancelled",
  );

  const plannedMinutes = past.reduce((sum, session) => sum + session.plannedMinutes, 0);
  const completedMinutes = past.reduce((sum, session) => sum + session.completedMinutes, 0);

  const bandCompletion: Record<TimeOfDayBand, { planned: number; completed: number }> = {
    morning: { planned: 0, completed: 0 },
    afternoon: { planned: 0, completed: 0 },
    evening: { planned: 0, completed: 0 },
  };

  for (const session of past) {
    const band = bandFor(minutesIntoLocalDay(toEpochMinutes(session.startAt), timeZone));
    bandCompletion[band].planned += session.plannedMinutes;
    bandCompletion[band].completed += session.completedMinutes;
  }

  // The band where the most planned time actually got done — only reported once
  // there is enough history for it to be a pattern rather than a coincidence.
  let bestBand: TimeOfDayBand | null = null;
  if (past.length >= MIN_SESSIONS_FOR_A_PATTERN) {
    let bestRate = -1;
    for (const band of ["morning", "afternoon", "evening"] as const) {
      const { planned, completed } = bandCompletion[band];
      if (planned <= 0) continue;
      const rate = completed / planned;
      if (rate > bestRate) {
        bestRate = rate;
        bestBand = band;
      }
    }
  }

  const finished = past.filter(
    (session) => session.status === "completed" || session.status === "partial",
  );

  const averageSessionMinutes =
    finished.length > 0
      ? Math.round(finished.reduce((sum, s) => sum + s.completedMinutes, 0) / finished.length)
      : null;

  // A course is at risk when its remaining work no longer fits comfortably in
  // the time before its own deadline.
  const coursesAtRisk: CourseAtRisk[] = [];
  for (const task of tasks) {
    if (task.status === "completed" || task.status === "cancelled") continue;
    if (!task.deadline) continue;

    const remainingMinutes = Math.max(0, task.estimatedMinutes - task.completedMinutes);
    if (remainingMinutes <= 0) continue;

    const minutesUntilDeadline = Math.max(0, toEpochMinutes(task.deadline) - now);
    // Assume a realistic four usable hours a day rather than every waking hour;
    // otherwise nothing would ever look at risk.
    const usableMinutes = (minutesUntilDeadline / 1440) * 240;
    const pressure = usableMinutes <= 0 ? Infinity : remainingMinutes / usableMinutes;

    if (pressure > 0.8) {
      coursesAtRisk.push({
        courseId: task.courseId,
        remainingMinutes,
        minutesUntilDeadline,
        pressure,
        taskTitle: task.title,
      });
    }
  }

  coursesAtRisk.sort((a, b) => b.pressure - a.pressure);

  const upcoming = tasks
    .filter(
      (task) =>
        task.deadline !== null &&
        task.status !== "completed" &&
        task.status !== "cancelled" &&
        toEpochMinutes(task.deadline) >= now,
    )
    .sort((a, b) => toEpochMinutes(a.deadline!) - toEpochMinutes(b.deadline!));

  const nextDeadline = upcoming[0]?.deadline ?? null;
  const workloadBeforeNextDeadline = nextDeadline
    ? upcoming
        .filter((task) => task.deadline === nextDeadline)
        .reduce((sum, task) => sum + Math.max(0, task.estimatedMinutes - task.completedMinutes), 0)
    : 0;

  return {
    consideredSessions: past.length,
    plannedMinutes,
    completedMinutes,
    adherence: plannedMinutes > 0 ? Math.min(1, completedMinutes / plannedMinutes) : null,
    bestBand,
    bandCompletion,
    averageSessionMinutes,
    rescheduledCount: sessions.filter((session) => session.wasRescheduled).length,
    missedCount: past.filter((session) => session.status === "missed").length,
    completedCount: past.filter((session) => session.status === "completed").length,
    coursesAtRisk: coursesAtRisk.slice(0, 5),
    workloadBeforeNextDeadline: {
      deadline: nextDeadline,
      remainingMinutes: workloadBeforeNextDeadline,
    },
  };
}

/**
 * Daily totals for the small activity strip.
 *
 * Returns every date in the range, including empty ones, so the strip shows
 * gaps honestly instead of silently compressing them away.
 */
export function dailyTotals({
  sessions,
  fromIso,
  toIso,
  timeZone,
}: {
  sessions: readonly InsightSession[];
  fromIso: string;
  toIso: string;
  timeZone: string;
}): Array<{ date: string; plannedMinutes: number; completedMinutes: number }> {
  const totals = new Map<string, { plannedMinutes: number; completedMinutes: number }>();

  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  for (let t = from; t <= to; t += 86_400_000) {
    totals.set(new Date(t).toISOString().slice(0, 10), {
      plannedMinutes: 0,
      completedMinutes: 0,
    });
  }

  for (const session of sessions) {
    if (session.status === "cancelled") continue;
    const date = epochMinutesToLocalDate(toEpochMinutes(session.startAt), timeZone);
    const entry = totals.get(date);
    if (!entry) continue;
    entry.plannedMinutes += session.plannedMinutes;
    entry.completedMinutes += session.completedMinutes;
  }

  return [...totals.entries()]
    .map(([date, value]) => ({ date, ...value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
