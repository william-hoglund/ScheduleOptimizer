"use client";

import type { EventInput } from "@fullcalendar/core";
import svLocale from "@fullcalendar/core/locales/sv";
import dayGridPlugin from "@fullcalendar/daygrid";
import luxon3Plugin from "@fullcalendar/luxon3";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";

import { renderEventContent } from "@/components/calendar/event-content";
import { useLocale } from "next-intl";

import type { CalendarEventRow, CourseRow, StudySessionRow } from "@/lib/supabase/types";

/**
 * The same proposed sessions `PlanPreview`'s list shows, as a week grid
 * instead — plus every lecture, tutorial and other fixed commitment already
 * on the calendar for the same horizon. The whole point of a plan is a
 * schedule that combines both; a grid showing only the proposed sessions in
 * isolation could not actually answer "does this fit around my classes?".
 *
 * Nothing here is draggable or clickable: locking, rejecting and approving
 * stay list-only actions, and a fixed event was never this plan's to edit in
 * the first place — both would need a grid that looked editable here, which
 * would be a lie on a draft that has not been saved anywhere yet.
 *
 * Deliberately its own small FullCalendar instance rather than reusing
 * `CalendarView` — that one fetches and persists real `calendar_events` via
 * its own server actions; a draft `study_sessions` row is a different shape
 * and does not exist as a calendar event until the plan is approved.
 */
export function PlanPreviewCalendar({
  sessions,
  fixedEvents,
  courses,
  timeZone,
}: {
  sessions: StudySessionRow[];
  fixedEvents: CalendarEventRow[];
  courses: CourseRow[];
  timeZone: string;
}) {
  const locale = useLocale();
  const courseById = new Map(courses.map((course) => [course.id, course]));

  const sessionEvents: EventInput[] = sessions.map((session) => {
    const course = session.course_id ? courseById.get(session.course_id) : undefined;
    return {
      id: `session:${session.id}`,
      title: session.title,
      extendedProps: { courseCode: course?.code ?? null },
      start: session.start_at,
      end: session.end_at,
      // Styled by class, like `CalendarView`, so the palette follows the
      // theme tokens and dark mode rather than a colour baked in here.
      classNames: ["sp-event", "sp-event-study"],
    };
  });

  // Same class logic `CalendarView` uses for the real calendar, so a lecture
  // looks like the same lecture in both places.
  const fixedCalendarEvents: EventInput[] = fixedEvents.map((event) => {
    const course = event.course_id ? courseById.get(event.course_id) : undefined;
    return {
      id: `event:${event.id}`,
      title: event.title,
      extendedProps: { courseCode: course?.code ?? null },
      start: event.start_at,
      end: event.end_at,
      allDay: event.is_all_day,
      classNames: ["sp-event", `sp-event-${event.event_type}`, event.is_fixed ? "" : "sp-event-movable"],
    };
  });

  const events = [...fixedCalendarEvents, ...sessionEvents];

  // Opens already showing the plan, whatever the horizon's start date is,
  // rather than defaulting to today's week and leaving a plan that starts
  // next week looking empty.
  const initialDate = sessions[0]?.start_at ?? fixedEvents[0]?.start_at;

  return (
    <div className="bg-card rounded-xl border p-2">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, luxon3Plugin]}
        initialView="timeGridWeek"
        initialDate={initialDate}
        timeZone={timeZone}
        locales={[svLocale]}
        locale={locale}
        firstDay={1}
        headerToolbar={{ left: "prev,next today", center: "title", right: "timeGridWeek,dayGridMonth" }}
        height="auto"
        nowIndicator
        // A fixed event can be all-day (see `CalendarView`'s own note on this) —
        // without this row, FullCalendar draws it as a midnight-to-midnight
        // block in the timed grid instead of a banner.
        allDaySlot
        slotMinTime="06:00:00"
        slotMaxTime="23:00:00"
        expandRows
        events={events}
        eventContent={renderEventContent}
        eventMinHeight={22}
      />
    </div>
  );
}
