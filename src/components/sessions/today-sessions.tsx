"use client";

import type { Route } from "next";
import { CalendarCheck, Check, Circle, Clock, ListChecks, Play, Square, Volume2, VolumeX } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import { RescheduleDialog } from "./reschedule-dialog";
import { SessionOutcome } from "./session-outcome";
import { ButtonLink } from "@/components/common/button-link";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { finishSession, startSession } from "@/features/sessions/actions";
import { STUDY_STYLES, defaultStyleFor, timerPhase, type StudyStyle } from "@/lib/sessions/study-timer";
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
  accountStyle = "none",
  methodByTaskId = {},
}: {
  sessions: StudySessionRow[];
  courses: CourseRow[];
  nowIso: string;
  timeZone: string;
  /** The account's study style (`breakMethod`), the default for every session. */
  accountStyle?: StudyStyle;
  /** A task's own study method, which can imply a different style. */
  methodByTaskId?: Record<string, string | null>;
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

                  {!isDone && session.started_at ? (
                    <RunningSession
                      session={session}
                      nowIso={nowIso}
                      defaultStyle={defaultStyleFor(session.task_id ? methodByTaskId[session.task_id] : null, accountStyle)}
                      taskMethod={session.task_id ? (methodByTaskId[session.task_id] ?? null) : null}
                      onFinished={(status) => {
                        setResolved((current) => new Set(current).add(session.id));
                        if (status === "partial") setReschedulingId(session.id);
                      }}
                    />
                  ) : null}

                  {!isDone && !session.started_at ? (
                    <StartButton
                      sessionId={session.id}
                      defaultStyle={defaultStyleFor(session.task_id ? methodByTaskId[session.task_id] : null, accountStyle)}
                    />
                  ) : null}

                  {isDone ? (
                    <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                      {session.status === "completed" || resolved.has(session.id) ? (
                        <Check className="text-success size-3" aria-hidden="true" />
                      ) : (
                        <Circle className="size-3" aria-hidden="true" />
                      )}
                      {t(`status.${session.status}`)}
                    </p>
                  ) : hasStarted && !session.started_at ? (
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

const styleKey = (sessionId: string) => `sp-session-style:${sessionId}`;
const sprintKey = (sessionId: string) => `sp-session-sprint:${sessionId}`;
const QUIZ_METHODS = new Set(["active_recall", "spaced_repetition"]);
const SOUND_KEY = "sp-timer-sound";

function readStoredStyle(sessionId: string): StudyStyle | null {
  try {
    const value = window.localStorage.getItem(styleKey(sessionId));
    return (STUDY_STYLES as readonly string[]).includes(value ?? "") ? (value as StudyStyle) : null;
  } catch {
    return null;
  }
}

function StartButton({ sessionId, defaultStyle }: { sessionId: string; defaultStyle: StudyStyle }) {
  const t = useTranslations("sessions.live");
  const [style, setStyle] = useState<StudyStyle>(defaultStyle);
  const [sprintMinutes, setSprintMinutes] = useState(45);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select
        aria-label={t("styleLabel")}
        value={style}
        onChange={(event) => setStyle(event.target.value as StudyStyle)}
        className="border-input bg-background h-8 rounded-md border px-2 text-xs"
      >
        {STUDY_STYLES.map((option) => (
          <option key={option} value={option}>
            {t(`styles.${option}`)}
          </option>
        ))}
      </select>
      {style === "sprint" ? (
        <label className="text-muted-foreground flex items-center gap-1 text-xs">
          <input
            type="number"
            min={5}
            max={240}
            step={5}
            value={sprintMinutes}
            onChange={(event) => setSprintMinutes(Number(event.target.value) || 45)}
            className="border-input bg-background h-8 w-16 rounded-md border px-2 text-xs"
            aria-label={t("sprintMinutes")}
          />
          {t("minutesShort")}
        </label>
      ) : null}
      <Button
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            try {
              window.localStorage.setItem(styleKey(sessionId), style);
              window.localStorage.setItem(sprintKey(sessionId), String(Math.min(240, Math.max(5, sprintMinutes))));
            } catch {
              // Private mode: the timer falls back to the default style.
            }
            // Asked here, on a click, because browsers only allow it from a gesture.
            if (style !== "none" && "Notification" in window && Notification.permission === "default") {
              void Notification.requestPermission();
            }
            await startSession(sessionId);
          })
        }
      >
        <Play className="size-3.5" aria-hidden="true" />
        {t("start")}
      </Button>
    </div>
  );
}

/** A soft two-note chime, synthesised so there's no audio file to ship. */
function chime() {
  try {
    const context = new AudioContext();
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      const start = context.currentTime + index * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.65);
    });
  } catch {
    // No audio available; the visual notice still shows.
  }
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A started session: its timer (if the style has one), notices, and Finish. */
function RunningSession({
  session,
  nowIso,
  defaultStyle,
  taskMethod,
  onFinished,
}: {
  session: StudySessionRow;
  nowIso: string;
  defaultStyle: StudyStyle;
  /** The task's own study method; recall-based ones get a "Quiz me" shortcut. */
  taskMethod: string | null;
  onFinished: (status: "completed" | "partial") => void;
}) {
  const t = useTranslations("sessions.live");
  const [now, setNow] = useState(() => Date.parse(nowIso));
  const [style, setStyle] = useState<StudyStyle>(defaultStyle);
  const [soundOn, setSoundOn] = useState(true);
  const [sprintMinutes, setSprintMinutes] = useState(45);
  const [isPending, startTransition] = useTransition();
  const lastPhase = useRef<string | null>(null);

  // Client-only state, read after mount so the server render matches.
  useEffect(() => {
    const stored = readStoredStyle(session.id);
    if (stored) setStyle(stored); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage only exists after mount
    try {
      setSoundOn(window.localStorage.getItem(SOUND_KEY) !== "off");
      const sprint = Number(window.localStorage.getItem(sprintKey(session.id)));
      if (sprint >= 5) setSprintMinutes(sprint);
    } catch {
      // Default stays on.
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session.id]);

  const elapsedSeconds = (now - Date.parse(session.started_at ?? nowIso)) / 1000;
  const phase = timerPhase(style, elapsedSeconds, session.planned_minutes, sprintMinutes);
  const phaseKey = `${phase.kind}:${phase.round}`;

  // A phase change is the moment to tell the student — but not on first
  // render, which would chime every time the page loads mid-session.
  useEffect(() => {
    if (lastPhase.current !== null && lastPhase.current !== phaseKey && phase.kind !== "free") {
      const message = t(`notices.${phase.kind}`, { title: session.title });
      if (soundOn) chime();
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(message);
        }
      } catch {
        // Some browsers (iOS Safari) have no page notifications; the card still updates.
      }
    }
    lastPhase.current = phaseKey;
  }, [phaseKey, phase.kind, session.title, soundOn, t]);

  function toggleSound() {
    setSoundOn((current) => {
      try {
        window.localStorage.setItem(SOUND_KEY, current ? "off" : "on");
      } catch {
        // Not persisted; fine for this session.
      }
      return !current;
    });
  }

  const elapsedMinutes = Math.max(0, Math.floor(elapsedSeconds / 60));
  const isBreak = phase.kind === "break" || phase.kind === "longBreak";

  return (
    <div className="mt-2 space-y-2">
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2.5 py-1.5",
          isBreak ? "bg-success/10" : "bg-primary/5",
        )}
        aria-live="polite"
      >
        <span className={cn("size-2 animate-pulse rounded-full", isBreak ? "bg-success" : "bg-primary")} aria-hidden="true" />
        <span className="text-sm font-medium">{t(`phases.${phase.kind}`, { round: phase.round })}</span>
        {phase.secondsLeft !== null ? (
          <span className="text-numeric text-lg font-semibold tabular-nums">{formatClock(phase.secondsLeft)}</span>
        ) : null}
        <span className="text-muted-foreground text-xs">
          {t("elapsed", { minutes: elapsedMinutes, planned: session.planned_minutes })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await finishSession(session.id);
              if (result.ok) onFinished(result.data.status);
            })
          }
        >
          <Square className="size-3.5" aria-hidden="true" />
          {t("finish")}
        </Button>
        {style !== "none" ? (
          <Button size="icon-sm" variant="ghost" onClick={toggleSound} aria-label={soundOn ? t("mute") : t("unmute")}>
            {soundOn ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
          </Button>
        ) : null}
        {taskMethod && QUIZ_METHODS.has(taskMethod) && session.course_id ? (
          <ButtonLink href={`/courses/${session.course_id}/learn?mode=quiz` as Route} size="sm" variant="outline">
            <ListChecks className="size-3.5" aria-hidden="true" />
            {t("quizMe")}
          </ButtonLink>
        ) : null}
        <span className="text-muted-foreground text-xs">
          {style === "sprint" ? t("sprintLabel", { minutes: sprintMinutes }) : t(`styles.${style}`)}
        </span>
      </div>
    </div>
  );
}
