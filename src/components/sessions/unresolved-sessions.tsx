"use client";

import { History } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { RescheduleDialog } from "./reschedule-dialog";
import { SessionOutcome } from "./session-outcome";
import type { StudySessionRow } from "@/lib/supabase/types";

/**
 * Sessions whose time has passed without an answer.
 *
 * Framed as a question, never an accusation. Nothing is recorded as missed
 * until the student says so — a student who studied without pressing a button
 * should not open the app to be told they failed.
 */
export function UnresolvedSessions({
  sessions,
  timeZone,
}: {
  sessions: StudySessionRow[];
  timeZone: string;
}) {
  const t = useTranslations("sessions.unresolved");
  const format = useFormatter();
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  const pending = sessions.filter((session) => !resolved.has(session.id));

  // Kept mounted while a reschedule is open: recording an outcome revalidates
  // the page, which empties this list — and unmounting here would take the
  // dialog with it, exactly when the student needs it.
  if (pending.length === 0 && reschedulingId === null) return null;

  return (
    <section className="border-warning/40 bg-warning/5 space-y-3 rounded-xl border p-4">
      <div className="flex items-start gap-2.5">
        <History className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold">{t("title")}</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">{t("body")}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {pending.map((session) => (
          <li key={session.id} className="bg-card rounded-lg border p-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <time className="text-numeric text-sm font-medium" dateTime={session.start_at}>
                {format.dateTime(new Date(session.start_at), {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone,
                })}
              </time>
              <span className="text-sm">{session.title}</span>
              <span className="text-numeric text-muted-foreground text-xs">
                {session.planned_minutes} min
              </span>
            </div>

            <div className="mt-2">
              <SessionOutcome
                session={session}
                timeZone={timeZone}
                onResolved={() => setResolved((current) => new Set(current).add(session.id))}
                onNeedsReschedule={setReschedulingId}
              />
            </div>
          </li>
        ))}
      </ul>
      <RescheduleDialog
        open={reschedulingId !== null}
        onOpenChange={(open) => {
          if (!open) setReschedulingId(null);
        }}
        sessionIds={reschedulingId ? [reschedulingId] : []}
        timeZone={timeZone}
      />
    </section>
  );
}
