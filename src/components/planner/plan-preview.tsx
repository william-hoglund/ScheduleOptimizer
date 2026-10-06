"use client";

import { Calendar, Check, List, Lock, LockOpen, Sparkles, Trash2, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PlanPreviewCalendar } from "./plan-preview-calendar";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import {
  approveDraftPlan,
  discardDraftPlan,
  generateAlternativePlan,
  rejectProposedSession,
  toggleSessionLock,
} from "@/features/planner/actions";
import type { SessionReason } from "@/lib/planner/types";
import type { CalendarEventRow, CourseRow, StudySessionRow } from "@/lib/supabase/types";
import type { PlannerRunInput } from "@/lib/validation/planner";
import { cn } from "@/lib/utils";

/**
 * The proposed plan, grouped by day.
 *
 * A list rather than a calendar grid on purpose: reviewing a proposal is a
 * reading task, and a day-by-day list makes the shape of the week — and each
 * session's reason — far easier to scan than coloured blocks. Once approved the
 * sessions appear on the real calendar, where dragging already works.
 */

function parseReason(raw: string | null): SessionReason | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "code" in parsed) return parsed as SessionReason;
  } catch {
    // A reason we cannot read is not worth breaking the page over.
  }
  return null;
}

function SessionRow({
  session,
  course,
  timeZone,
}: {
  session: StudySessionRow;
  course: CourseRow | undefined;
  timeZone: string;
}) {
  const t = useTranslations("planner");
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  const reason = parseReason(session.generation_reason);

  return (
    <li className="bg-card flex items-start gap-3 rounded-lg border p-3">
      <span
        className="mt-1.5 h-8 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: course?.color ?? "var(--event-study)" }}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <time className="text-numeric text-sm font-medium" dateTime={session.start_at}>
            {format.dateTime(new Date(session.start_at), {
              hour: "2-digit",
              minute: "2-digit",
              timeZone,
            })}
            –
            {format.dateTime(new Date(session.end_at), {
              hour: "2-digit",
              minute: "2-digit",
              timeZone,
            })}
          </time>
          <span className="text-sm">{session.title}</span>
          {course?.code ? (
            <span className="text-numeric text-muted-foreground text-xs">{course.code}</span>
          ) : null}
          <span className="text-numeric text-muted-foreground text-xs">
            {t("preview.minutes", { minutes: session.planned_minutes })}
          </span>
        </div>

        {/* Why the engine chose this slot. The whole product rests on being able
            to answer that, so it is shown inline rather than behind a tooltip. */}
        {reason ? (
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
            <Sparkles className="size-3 shrink-0" aria-hidden="true" />
            {t(`reasons.${reason.code}`, reason.details ?? {})}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={session.is_locked ? t("preview.unlock") : t("preview.lock")}
          aria-pressed={session.is_locked}
          disabled={isPending}
          onClick={() =>
            startTransition(() => void toggleSessionLock(session.id, !session.is_locked))
          }
        >
          {session.is_locked ? (
            <Lock className="text-primary size-3.5" aria-hidden="true" />
          ) : (
            <LockOpen className="size-3.5" aria-hidden="true" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("preview.reject")}
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await rejectProposedSession(session.id);
              if (result.ok) setRemoved(true);
            })
          }
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

export function PlanPreview({
  planId,
  sessions,
  fixedEvents,
  courses,
  timeZone,
  runOptions,
  summary,
}: {
  planId: string;
  sessions: StudySessionRow[];
  /** Lectures, tutorials, anything already on the calendar for this horizon —
   *  shown alongside the proposed sessions in the calendar view, so the plan
   *  reads as the combined schedule it actually is. List-view actions (lock,
   *  reject) only ever touch `sessions`; these are never editable from here. */
  fixedEvents: CalendarEventRow[];
  courses: CourseRow[];
  timeZone: string;
  runOptions: PlannerRunInput;
  summary: { totalMinutes: number; dayCount: number; coveragePercent: number };
}) {
  const t = useTranslations("planner");
  const format = useFormatter();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"list" | "calendar">("list");

  const courseById = new Map(courses.map((course) => [course.id, course]));

  if (sessions.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState title={t("preview.empty")} description={t("preview.emptyBody")} />
        <Button
          variant="ghost"
          disabled={isPending}
          onClick={() => startTransition(() => void discardDraftPlan(planId))}
        >
          {t("actions.discard")}
        </Button>
      </div>
    );
  }

  // Grouped by the student's local date, not UTC.
  const byDate = new Map<string, StudySessionRow[]>();
  for (const session of sessions) {
    const date = format.dateTime(new Date(session.start_at), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
    const list = byDate.get(date) ?? [];
    list.push(session);
    byDate.set(date, list);
  }

  const totalHours = Math.floor(summary.totalMinutes / 60);
  const totalMinutes = summary.totalMinutes % 60;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("summary.title")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            <span className="text-numeric">
              {t("summary.totalTime", { hours: totalHours, minutes: totalMinutes })}
            </span>
            {" · "}
            {t("summary.across", { days: summary.dayCount })}
            {" · "}
            <span className="text-numeric">
              {t("summary.coverage", { percent: summary.coveragePercent })}
            </span>
          </p>
        </div>

        {/* Two readings of the same draft — locking, rejecting and approving
            only ever act on the list, so switching views never changes what
            the next click does. */}
        <div className="bg-muted flex items-center gap-0.5 rounded-lg p-0.5" role="group" aria-label={t("preview.viewList")}>
          <button
            type="button"
            aria-pressed={mode === "list"}
            onClick={() => setMode("list")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              mode === "list"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <List className="size-3.5" aria-hidden="true" />
            {t("preview.viewList")}
          </button>
          <button
            type="button"
            aria-pressed={mode === "calendar"}
            onClick={() => setMode("calendar")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              mode === "calendar"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Calendar className="size-3.5" aria-hidden="true" />
            {t("preview.viewCalendar")}
          </button>
        </div>
      </div>

      {mode === "calendar" ? (
        <PlanPreviewCalendar
          sessions={sessions}
          fixedEvents={fixedEvents}
          courses={courses}
          timeZone={timeZone}
        />
      ) : (
        <div className="space-y-5">
          {[...byDate.entries()].map(([date, daySessions]) => {
            const dayTotal = daySessions.reduce((sum, s) => sum + s.planned_minutes, 0);
            const first = daySessions[0];

            return (
              <section key={date} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="label-caps">
                    {first
                      ? format.dateTime(new Date(first.start_at), {
                          weekday: "long",
                          day: "numeric",
                          month: "short",
                          timeZone,
                        })
                      : date}
                  </h3>
                  <span className="text-numeric text-muted-foreground text-xs">
                    {t("preview.minutes", { minutes: dayTotal })}
                  </span>
                </div>

                <ul className="space-y-2">
                  {daySessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      course={session.course_id ? courseById.get(session.course_id) : undefined}
                      timeZone={timeZone}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t pt-5">
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await approveDraftPlan(planId);
              // Straight to the calendar: once approved the draft no longer
              // exists, so staying here would show "no plan yet" — confusing
              // right after saying yes. The sessions themselves are the
              // confirmation.
              if (result.ok) router.push("/calendar");
            })
          }
        >
          <Check className="size-4" aria-hidden="true" />
          {isPending ? t("actions.approving") : t("actions.approve")}
        </Button>

        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => startTransition(() => void generateAlternativePlan(runOptions, planId))}
        >
          <Sparkles className="size-4" aria-hidden="true" />
          {t("actions.alternative")}
        </Button>

        <Button
          variant="ghost"
          disabled={isPending}
          onClick={() => startTransition(() => void discardDraftPlan(planId))}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {t("actions.discard")}
        </Button>
      </div>
    </div>
  );
}

export { parseReason };
