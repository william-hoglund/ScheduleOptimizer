"use client";

import { CalendarX } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { RescheduleDialog } from "./reschedule-dialog";
import { SessionGuidance } from "./session-guidance";
import { Button } from "@/components/ui/button";
import type { CourseRow, StudySessionRow } from "@/lib/supabase/types";

/**
 * The next week's planned sessions, each saying what it is for — and a way
 * to say "I can't do this one" that moves it to a day the student picks,
 * leaving the rest of the plan where it is.
 */
export function UpcomingSessions({
  sessions,
  courses,
  timeZone,
  today,
  typeByTaskId,
}: {
  sessions: StudySessionRow[];
  courses: CourseRow[];
  timeZone: string;
  today: string;
  typeByTaskId: Record<string, string>;
}) {
  const t = useTranslations("sessions");
  const format = useFormatter();
  const [movingId, setMovingId] = useState<string | null>(null);
  const courseById = new Map(courses.map((course) => [course.id, course]));

  if (sessions.length === 0) return null;

  // Grouped by the student's own calendar day.
  const byDay = new Map<string, StudySessionRow[]>();
  for (const session of sessions) {
    const day = format.dateTime(new Date(session.start_at), { weekday: "long", day: "numeric", month: "short", timeZone });
    byDay.set(day, [...(byDay.get(day) ?? []), session]);
  }

  const time = (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone });

  return (
    <section className="space-y-3">
      <h2 className="label-caps">{t("upcoming.title")}</h2>
      <div className="space-y-4">
        {[...byDay.entries()].map(([day, daySessions]) => (
          <div key={day} className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-medium">{day}</h3>
            <ul className="space-y-2">
              {daySessions.map((session) => {
                const course = session.course_id ? courseById.get(session.course_id) : undefined;
                return (
                  <li key={session.id} className="bg-card flex items-start gap-3 rounded-lg border p-3">
                    <span
                      className="mt-1.5 size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: course?.color ?? "var(--event-study)" }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <time className="text-numeric font-medium" dateTime={session.start_at}>
                          {time(session.start_at)}–{time(session.end_at)}
                        </time>
                        <span>{session.title}</span>
                      </p>
                      <SessionGuidance
                        generationReason={session.generation_reason}
                        taskType={session.task_id ? typeByTaskId[session.task_id] : null}
                      />
                    </div>
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setMovingId(session.id)}>
                      <CalendarX className="size-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">{t("move.cantDoThis")}</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <RescheduleDialog
        open={movingId !== null}
        onOpenChange={(open) => {
          if (!open) setMovingId(null);
        }}
        sessionIds={movingId ? [movingId] : []}
        timeZone={timeZone}
        chooseDay
        today={today}
      />
    </section>
  );
}
