"use client";

import { CalendarCheck, Check, Circle, Clock } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { RescheduleDialog } from "./reschedule-dialog";
import { SessionOutcome } from "./session-outcome";
import { EmptyState } from "@/components/common/empty-state";
import type { CourseRow, StudySessionRow } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

/**
 * Today's plan, and the place work actually gets recorded.
 *
 * A session shows its outcome buttons once it has started — asking "how did
 * that go?" about something three hours away would be nonsense.
 */
export function TodaySessions({
  sessions,
  courses,
  nowIso,
  timeZone,
}: {
  sessions: StudySessionRow[];
  courses: CourseRow[];
  nowIso: string;
  timeZone: string;
}) {
  const t = useTranslations("sessions");
  const format = useFormatter();
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  const courseById = new Map(courses.map((course) => [course.id, course]));
  const now = new Date(nowIso).getTime();

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title={t("today.empty")}
        description={t("today.emptyBody")}
      />
    );
  }

  const remaining = sessions.filter(
    (session) => session.status === "planned" && !resolved.has(session.id),
  ).length;

  return (
    <div className="space-y-3">
      {remaining > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("today.remaining", { count: remaining })}
        </p>
      ) : null}

      <ul className="space-y-2">
        {sessions.map((session) => {
          const course = session.course_id ? courseById.get(session.course_id) : undefined;
          const start = new Date(session.start_at).getTime();
          const end = new Date(session.end_at).getTime();

          const isDone = session.status !== "planned" || resolved.has(session.id);
          const hasStarted = start <= now;
          const isNow = hasStarted && end > now;

          return (
            <li
              key={session.id}
              className={cn(
                "bg-card rounded-lg border p-3",
                isNow && "border-primary/50 ring-primary/15 ring-2",
                isDone && "opacity-60",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 size-2.5 shrink-0 rounded-full"
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
                    <span className={cn("text-sm", isDone && "line-through")}>{session.title}</span>

                    {isNow ? (
                      <span className="text-primary flex items-center gap-1 text-xs font-medium">
                        <Clock className="size-3" aria-hidden="true" />
                        {t("today.now")}
                      </span>
                    ) : null}
                  </div>

                  {isDone ? (
                    <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                      {session.status === "completed" || resolved.has(session.id) ? (
                        <Check className="text-success size-3" aria-hidden="true" />
                      ) : (
                        <Circle className="size-3" aria-hidden="true" />
                      )}
                      {t(`status.${session.status}`)}
                    </p>
                  ) : hasStarted ? (
                    <div className="mt-2">
                      <p className="text-muted-foreground mb-1.5 text-xs">{t("outcome.prompt")}</p>
                      <SessionOutcome
                        session={session}
                        timeZone={timeZone}
                        onResolved={() =>
                          setResolved((current) => new Set(current).add(session.id))
                        }
                        onNeedsReschedule={setReschedulingId}
                      />
                    </div>
                  ) : null}
                </div>

                <span className="text-numeric text-muted-foreground shrink-0 text-xs">
                  {session.planned_minutes} min
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <RescheduleDialog
        open={reschedulingId !== null}
        onOpenChange={(open) => {
          if (!open) setReschedulingId(null);
        }}
        sessionIds={reschedulingId ? [reschedulingId] : []}
        timeZone={timeZone}
      />
    </div>
  );
}
