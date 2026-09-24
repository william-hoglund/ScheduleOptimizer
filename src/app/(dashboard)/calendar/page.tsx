import { getTranslations } from "next-intl/server";

import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/layout/page-header";
import { createPageMetadata } from "@/components/layout/placeholder-page";
import { toCalendarEventDto } from "@/features/calendar/event-dto";
import { requireUserContext } from "@/server/auth";
import { listCalendarSources } from "@/server/calendar-source-service";
import { nowIso } from "@/server/clock";
import { listCalendarEvents } from "@/server/calendar-service";
import { listCourses } from "@/server/course-service";

export const generateMetadata = () => createPageMetadata("calendar");

export default async function CalendarPage() {
  const { user, timeZone } = await requireUserContext();
  const t = await getTranslations();

  // A generous first window so the calendar paints immediately; the client
  // refetches whenever the student navigates outside it.
  const now = new Date(nowIso()).getTime();
  const from = new Date(now - 45 * 86_400_000).toISOString();
  const to = new Date(now + 90 * 86_400_000).toISOString();

  const [events, courses] = await Promise.all([
    listCalendarEvents(user.id, from, to),
    listCourses(user.id),
  ]);

  // The calendar list only narrows a view that already works, so a missing
  // migration costs the filter and nothing else.
  const sources = await listCalendarSources(user.id)
    .then((rows) => rows.map((row) => ({ id: row.id, name: row.name })))
    .catch((cause: unknown) => {
      console.error("[calendar] calendars unavailable:", cause);
      return [];
    });

  return (
    <div className="space-y-6">
      <PageHeader title={t("pages.calendar.title")} description={t("pages.calendar.description")} />

      <CalendarView
        initialEvents={events.map(toCalendarEventDto)}
        courses={courses}
        sources={sources}
        timeZone={timeZone}
      />
    </div>
  );
}
