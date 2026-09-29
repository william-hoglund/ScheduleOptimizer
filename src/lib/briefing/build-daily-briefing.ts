import type { ForecastReason, HorizonForecast } from "@/lib/intelligence/workload-forecast";
import type { EventType } from "@/lib/supabase/types";

/**
 * "What actually matters today?" Pure composition of data three other
 * services already produce — no new computation, no AI. Mirrors the
 * discipline of `lib/insights/compute-insights.ts`: no I/O, no clock reads,
 * plain data in and out.
 */

const MAX_FOCUS_SESSIONS = 3;

export type DailyBriefingSession = {
  title: string;
  courseId: string | null;
  startAt: string;
  endAt: string;
  plannedMinutes: number;
};

export type DailyBriefingEvent = {
  title: string;
  startAt: string;
  endAt: string;
  eventType: EventType;
  isFixed: boolean;
};

export type DailyBriefing = {
  focusSessions: Array<{ title: string; courseId: string | null; minutes: number; startAt: string }>;
  plannedMinutesToday: number;
  availableMinutesToday: number;
  fixedEventsToday: Array<{ title: string; startAt: string; endAt: string; eventType: EventType }>;
  /** The first personal, fixed commitment today — the thing worth protecting. */
  protect: { title: string; startAt: string } | null;
  /** From the 7-day forecast; null once pressure is "normal" — nothing to warn about. */
  watchOut: ForecastReason | null;
};

export type GreetingBand = "morning" | "afternoon" | "evening";

/** Which greeting to show, from the local hour — pure so it's testable without a clock. */
export function greetingBandFor(localHour: number): GreetingBand {
  if (localHour < 12) return "morning";
  if (localHour < 18) return "afternoon";
  return "evening";
}

export function buildDailyBriefing({
  sessions,
  eventsToday,
  availableMinutesToday,
  sevenDayForecast,
}: {
  sessions: readonly DailyBriefingSession[];
  eventsToday: readonly DailyBriefingEvent[];
  availableMinutesToday: number;
  sevenDayForecast: HorizonForecast | null;
}): DailyBriefing {
  const sortedSessions = [...sessions].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );

  const focusSessions = sortedSessions.slice(0, MAX_FOCUS_SESSIONS).map((session) => ({
    title: session.title,
    courseId: session.courseId,
    minutes: session.plannedMinutes,
    startAt: session.startAt,
  }));

  const plannedMinutesToday = sessions.reduce((sum, session) => sum + session.plannedMinutes, 0);

  const fixedEventsToday = eventsToday
    .filter((event) => event.isFixed)
    .map((event) => ({
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      eventType: event.eventType,
    }));

  // The first personal commitment of the day — not every fixed event (a
  // lecture is not something a student needs to be told to "protect").
  const firstPersonal = fixedEventsToday.find((event) => event.eventType === "personal") ?? null;
  const protect = firstPersonal ? { title: firstPersonal.title, startAt: firstPersonal.startAt } : null;

  const watchOut =
    sevenDayForecast && sevenDayForecast.pressure !== "normal" ? sevenDayForecast.mainReason : null;

  return {
    focusSessions,
    plannedMinutesToday,
    availableMinutesToday,
    fixedEventsToday,
    protect,
    watchOut,
  };
}
