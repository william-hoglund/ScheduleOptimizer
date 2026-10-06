"use client";

import type { Route } from "next";
import { BookOpen, Check, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ButtonLink } from "@/components/common/button-link";
import { Button } from "@/components/ui/button";
import { setClassAttendance } from "@/features/sessions/actions";
import type { CalendarEventRow, EventAttendance } from "@/lib/supabase/types";

/**
 * "Did you make it to these?" for the past week's classes, and a standing
 * reminder for the ones missed until they've been caught up on.
 *
 * Same tone rule as session outcomes: the student says what happened, nothing
 * is assumed, and a missed class leads straight to help rather than a mark
 * against them.
 */
export function ClassAttendance({ events, timeZone }: { events: CalendarEventRow[]; timeZone: string }) {
  const t = useTranslations("sessions.attendance");
  const format = useFormatter();
  // Optimistic, so a row reacts instantly; the revalidated page agrees shortly after.
  const [local, setLocal] = useState<Record<string, EventAttendance>>({});
  const [isPending, startTransition] = useTransition();

  const rows = events
    .map((event) => ({ event, attendance: local[event.id] ?? event.attendance }))
    .filter((row) => row.attendance === null || row.attendance === "missed");

  if (rows.length === 0) return null;

  function mark(eventId: string, attendance: EventAttendance) {
    setLocal((current) => ({ ...current, [eventId]: attendance }));
    startTransition(async () => {
      const result = await setClassAttendance(eventId, attendance);
      if (!result.ok) {
        setLocal((current) => {
          const next = { ...current };
          delete next[eventId];
          return next;
        });
      }
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="label-caps">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>
      <ul className="space-y-2">
        {rows.map(({ event, attendance }) => (
          <li key={event.id} className="bg-card flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{event.title}</p>
              <p className="text-muted-foreground text-xs">
                {format.dateTime(new Date(event.start_at), {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone,
                })}
                {attendance === "missed" ? ` · ${t("missedLabel")}` : ""}
              </p>
            </div>

            {attendance === "missed" ? (
              <div className="flex flex-wrap gap-1.5">
                {event.course_id ? (
                  <ButtonLink href={`/courses/${event.course_id}/learn?catchUp=${event.id}` as Route} size="sm">
                    <BookOpen className="size-3.5" aria-hidden="true" />
                    {t("catchUp")}
                  </ButtonLink>
                ) : null}
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => mark(event.id, "caught_up")}>
                  {t("caughtUp")}
                </Button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => mark(event.id, "attended")}>
                  <Check className="size-3.5" aria-hidden="true" />
                  {t("attended")}
                </Button>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => mark(event.id, "missed")}>
                  <X className="size-3.5" aria-hidden="true" />
                  {t("missed")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
