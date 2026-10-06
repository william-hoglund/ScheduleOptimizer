import type { EventContentArg } from "@fullcalendar/core";

import { splitEventTitle } from "@/lib/calendar/event-title";

/**
 * How an event reads inside the week/day grid, shared by the real calendar
 * and the planner's preview so both look the same.
 *
 * Name first, time second: the name is what you scan for, and FullCalendar's
 * default (time on its own line first) left a 40-minute block with no room for
 * the name at all. Short blocks collapse to a single line via a container
 * query in globals.css, and the full text is always one hover away.
 *
 * Other views (month, agenda) keep FullCalendar's own rendering, which is
 * already built for their shapes.
 */
export function renderEventContent(arg: EventContentArg) {
  if (!arg.view.type.startsWith("timeGrid") || arg.event.allDay) return true;

  const { code, title } = splitEventTitle(
    arg.event.extendedProps.courseCode as string | null | undefined,
    arg.event.title,
  );

  return (
    <div className="sp-ev" title={`${code ? `${code} · ` : ""}${title}\n${arg.timeText}`}>
      <div className="sp-ev-title">
        {code ? <span className="sp-ev-code">{code}</span> : null}
        {title}
      </div>
      <div className="sp-ev-time">{arg.timeText}</div>
    </div>
  );
}
