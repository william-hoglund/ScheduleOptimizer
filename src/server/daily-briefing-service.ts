import "server-only";

import { buildDailyBriefing, type DailyBriefing } from "@/lib/briefing/build-daily-briefing";
import { utcToLocalDate, wallClockToUtc } from "@/lib/calendar/time";
import { getAvailabilityForRange } from "./availability-lookup";
import { listCalendarEvents } from "./calendar-service";
import { listSessionsBetween } from "./session-service";
import { getWorkloadForecast } from "./workload-forecast-service";

/**
 * The database bridge for the Daily Briefing. `build-daily-briefing.ts` stays
 * pure — this loads today's sessions and events, the 7-day forecast, and
 * today's available minutes, and hands plain data to it. Same split as every
 * other `*-service.ts` here.
 */

export async function getDailyBriefing({
  userId,
  timeZone,
  nowIso,
}: {
  userId: string;
  timeZone: string;
  nowIso: string;
}): Promise<DailyBriefing> {
  const today = utcToLocalDate(nowIso, timeZone);
  // The student's own day, not a UTC one — same reasoning as the dashboard's
  // own "today" window.
  const dayStart = wallClockToUtc(`${today}T00:00`, timeZone) ?? nowIso;
  const dayEnd = wallClockToUtc(`${today}T23:59`, timeZone) ?? nowIso;

  const [sessions, events, forecasts, availability] = await Promise.all([
    listSessionsBetween(userId, dayStart, dayEnd),
    listCalendarEvents(userId, dayStart, dayEnd),
    getWorkloadForecast({ userId, timeZone, nowIso }),
    getAvailabilityForRange({
      userId,
      timeZone,
      nowIso,
      range: { startDate: today, endDate: today },
      seed: "briefing",
    }),
  ]);

  return buildDailyBriefing({
    sessions: sessions.map((session) => ({
      title: session.title,
      courseId: session.course_id,
      startAt: session.start_at,
      endAt: session.end_at,
      plannedMinutes: session.planned_minutes,
    })),
    eventsToday: events.map((event) => ({
      title: event.title,
      startAt: event.start_at,
      endAt: event.end_at,
      eventType: event.event_type,
      isFixed: event.is_fixed,
    })),
    availableMinutesToday: availability.availableMinutes,
    sevenDayForecast: forecasts.find((forecast) => forecast.horizonDays === 7) ?? null,
  });
}
