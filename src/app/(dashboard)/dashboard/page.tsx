import { CalendarClock, CheckSquare, Clock, Flag, Sparkles } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { ButtonLink } from "@/components/common/button-link";
import { StatTile } from "@/components/common/stat-tile";
import { DailyBriefingPanel } from "@/components/dashboard/daily-briefing";
import { PageHeader } from "@/components/layout/page-header";
import { createPageMetadata } from "@/components/layout/placeholder-page";
import { TodaySessions } from "@/components/sessions/today-sessions";
import { ClassAttendance } from "@/components/sessions/class-attendance";
import { UnresolvedSessions } from "@/components/sessions/unresolved-sessions";
import { greetingBandFor, type DailyBriefing } from "@/lib/briefing/build-daily-briefing";
import { utcToLocalDate, utcToWallClock, wallClockToUtc } from "@/lib/calendar/time";
import { groupTodos, minutesThisWeek } from "@/lib/tasks/group-todos";
import { daysUntil } from "@/lib/tasks/group-tasks";
import { requireUserContext } from "@/server/auth";
import { nowIso } from "@/server/clock";
import { listCourses } from "@/server/course-service";
import { getDailyBriefing } from "@/server/daily-briefing-service";
import { findUnresolvedSessions, listSessionsBetween } from "@/server/session-service";
import { listTasks } from "@/server/task-service";
import { listTodos } from "@/server/todo-service";
import { listClassesNeedingAttention } from "@/server/calendar-service";
import { getStudyPreferences } from "@/server/preference-service";

export const generateMetadata = () => createPageMetadata("dashboard");

/** "1h 30m", or "45m" when there is no hour to show. */
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

export default async function DashboardPage() {
  const { user, timeZone } = await requireUserContext();
  const t = await getTranslations();
  const format = await getFormatter();

  const now = nowIso();
  const today = utcToLocalDate(now, timeZone);

  // The student's own day, not a UTC one — otherwise "today" would start at
  // 02:00 for a Swedish student in summer.
  const dayStart = wallClockToUtc(`${today}T00:00`, timeZone) ?? now;
  const dayEnd = wallClockToUtc(`${today}T23:59`, timeZone) ?? now;

  const [todaySessions, unresolved, courses, tasks, preferences] = await Promise.all([
    listSessionsBetween(user.id, dayStart, dayEnd),
    findUnresolvedSessions(user.id, now),
    listCourses(user.id),
    listTasks(user.id, { includeCompleted: false }),
    getStudyPreferences(user.id).catch(() => null),
  ]);

  /**
   * To-dos depend on a migration that may not be applied yet, and they are the
   * newest thing here. A missing table costs one tile rather than the morning's
   * dashboard — the same rule study groups follow on Insights.
   */
  const todoMinutes = await listTodos(user.id)
    .then((todos) => minutesThisWeek(groupTodos(todos, now, timeZone)))
    .catch((cause: unknown) => {
      console.error("[dashboard] to-dos unavailable:", cause);
      return null;
    });

  // Needs migration 0017; until it's applied this section simply doesn't show.
  const pastClasses = await listClassesNeedingAttention(user.id, now).catch((cause: unknown) => {
    console.error("[dashboard] class attendance unavailable:", cause);
    return [];
  });

  // Anything still open today is not "unresolved" yet — it has not finished.
  const unresolvedBefore = unresolved.filter(
    (session) => new Date(session.end_at).getTime() < new Date(dayStart).getTime(),
  );

  const nextDeadline = tasks
    .filter((task) => task.deadline !== null)
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))[0];

  /**
   * The briefing reads real planning data across several services (sessions,
   * calendar events, the workload forecast) — a genuine failure there must
   * hide only this panel, never the stat tiles and today's sessions below it.
   */
  let briefing: DailyBriefing | null = null;
  try {
    briefing = await getDailyBriefing({ userId: user.id, timeZone, nowIso: now });
  } catch (cause) {
    console.error("[dashboard] daily briefing unavailable:", cause);
  }
  const courseNameById = Object.fromEntries(courses.map((course) => [course.id, course.name]));
  const localHour = Number(utcToWallClock(now, timeZone).slice(11, 13));

  const plannedToday = todaySessions.reduce((sum, session) => sum + session.planned_minutes, 0);
  const doneToday = todaySessions
    .filter((session) => session.status === "completed" || session.status === "partial")
    .reduce((sum, session) => sum + session.completed_minutes, 0);

  const deadlineDays = nextDeadline?.deadline
    ? daysUntil(nextDeadline.deadline, now, timeZone)
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("pages.dashboard.title")}
        description={t("pages.dashboard.description")}
        actions={
          <ButtonLink href="/planner">
            <Sparkles className="size-4" aria-hidden="true" />
            {t("planner.setup.generate")}
          </ButtonLink>
        }
      />

      <UnresolvedSessions sessions={unresolvedBefore} timeZone={timeZone} />

      <ClassAttendance events={pastClasses} timeZone={timeZone} />

      {briefing ? (
        <DailyBriefingPanel
          briefing={briefing}
          greeting={greetingBandFor(localHour)}
          courseNameById={courseNameById}
          timeZone={timeZone}
        />
      ) : null}

      {/*
        Always shown, with honest zeros. Tiles that appear only once there is
        data mean the shape of the page changes under the student on the day
        they first generate a plan.
      */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Clock}
          label={t("insights.plannedToday")}
          value={plannedToday > 0 ? formatMinutes(plannedToday) : "—"}
          hint={plannedToday > 0 ? t("sessions.today.count", { count: todaySessions.length }) : undefined}
        />

        <StatTile
          icon={CheckSquare}
          label={t("insights.doneToday")}
          value={doneToday > 0 ? formatMinutes(doneToday) : "—"}
        />

        <StatTile
          icon={CheckSquare}
          label={t("todos.tileLabel")}
          value={todoMinutes === null ? "—" : todoMinutes > 0 ? formatMinutes(todoMinutes) : "—"}
          hint={todoMinutes ? t("todos.tileHint") : undefined}
        />

        <StatTile
          icon={Flag}
          label={t("insights.nextDeadline")}
          value={
            deadlineDays === null
              ? "—"
              : deadlineDays <= 0
                ? t("tasks.dueToday")
                : deadlineDays === 1
                  ? t("tasks.dueTomorrow")
                  : t("tasks.dueInDays", { days: deadlineDays })
          }
          hint={nextDeadline?.title}
          // Two days is when a deadline stops being something to plan for and
          // starts being something to do.
          tone={deadlineDays !== null && deadlineDays <= 2 ? "attention" : "neutral"}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">{t("sessions.today.title")}</h2>
          <time className="text-numeric text-muted-foreground text-xs" dateTime={today}>
            {format.dateTime(new Date(now), {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone,
            })}
          </time>
        </div>

        <TodaySessions
          sessions={todaySessions}
          courses={courses}
          nowIso={now}
          timeZone={timeZone}
          accountStyle={preferences?.break_method ?? "none"}
          methodByTaskId={Object.fromEntries(tasks.map((task) => [task.id, task.preferred_study_method]))}
        />
      </section>

      {todaySessions.length === 0 && tasks.length > 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <CalendarClock className="size-4" aria-hidden="true" />
          {t("planner.preview.noPlanBody")}
        </p>
      ) : null}
    </div>
  );
}
