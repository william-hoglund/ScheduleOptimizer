"use client";

import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import svLocale from "@fullcalendar/core/locales/sv";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import luxon3Plugin from "@fullcalendar/luxon3";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useRef, useState, useTransition } from "react";

import {
  CalendarFilters,
  type CalendarFilterState,
  type CalendarSourceOption,
} from "./calendar-filters";
import { EventFormDialog } from "./event-form-dialog";
import { ButtonLink } from "@/components/common/button-link";
import { Button } from "@/components/ui/button";
import { fetchEventsInRange, moveEvent } from "@/features/calendar/actions";
import type { CalendarEventDto } from "@/features/calendar/event-dto";
import type { CourseRow } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type ViewKey = "day" | "week" | "month" | "agenda";

const VIEW_TO_FULLCALENDAR: Record<ViewKey, string> = {
  day: "timeGridDay",
  week: "timeGridWeek",
  month: "dayGridMonth",
  agenda: "listWeek",
};

/** "YYYY-MM-DDTHH:MM" from a Date already expressed in the target zone. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function CalendarView({
  initialEvents,
  courses,
  sources,
  timeZone,
}: {
  initialEvents: CalendarEventDto[];
  courses: CourseRow[];
  /** Imported calendars, so a merged view can be narrowed to one timetable. */
  sources: CalendarSourceOption[];
  timeZone: string;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const calendarRef = useRef<FullCalendar>(null);

  const [events, setEvents] = useState<CalendarEventDto[]>(initialEvents);
  const [view, setView] = useState<ViewKey>("week");
  const [title, setTitle] = useState("");
  const [filters, setFilters] = useState<CalendarFilterState>({
    courseId: "",
    eventType: "",
    sourceId: "",
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEventDto | null>(null);
  const [range, setRange] = useState<{ startLocal: string; endLocal: string } | null>(null);
  const [, startTransition] = useTransition();

  /**
   * Refetch whenever the visible window changes, so navigating to a month we
   * have not loaded still shows its events rather than an empty grid.
   */
  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setTitle(arg.view.title);
    startTransition(async () => {
      const result = await fetchEventsInRange(arg.start.toISOString(), arg.end.toISOString());
      if (result.ok) setEvents(result.data);
    });
  }, []);

  const visible = events.filter(
    (event) =>
      (!filters.courseId || event.courseId === filters.courseId) &&
      (!filters.eventType || event.eventType === filters.eventType) &&
      (!filters.sourceId || event.sourceId === filters.sourceId),
  );

  const fcEvents: EventInput[] = visible.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.startIso,
    end: event.endIso,
    // Without this, an imported all-day event (is_all_day) rendered as an
    // ordinary midnight-to-midnight block in the timed grid instead of the
    // dedicated all-day row below — allDaySlot has to be true too, see the
    // FullCalendar config below.
    allDay: event.isAllDay,
    // Styled by class rather than inline colour so the palette follows the
    // theme tokens and dark mode for free.
    classNames: [
      `sp-event`,
      `sp-event-${event.eventType}`,
      event.isFixed ? "" : "sp-event-movable",
    ],
    extendedProps: { dto: event },
  }));

  function openForEvent(event: CalendarEventDto) {
    setEditing(event);
    setRange(null);
    setDialogOpen(true);
  }

  function openForRange(startLocal: string, endLocal: string) {
    setEditing(null);
    setRange({ startLocal, endLocal });
    setDialogOpen(true);
  }

  const api = () => calendarRef.current?.getApi();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("previous")}
            onClick={() => api()?.prev()}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("next")}
            onClick={() => api()?.next()}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => api()?.today()}>
            {t("today")}
          </Button>
        </div>

        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>

        <div
          className="bg-muted flex items-center gap-0.5 rounded-lg p-0.5"
          role="group"
          aria-label={t("views.week")}
        >
          {(Object.keys(VIEW_TO_FULLCALENDAR) as ViewKey[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => {
                setView(key);
                api()?.changeView(VIEW_TO_FULLCALENDAR[key]);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                view === key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`views.${key}`)}
            </button>
          ))}
        </div>

        <ButtonLink href="/import-export" variant="outline" size="sm">
          <ArrowLeftRight className="size-4" aria-hidden="true" />
          {t("importExport")}
        </ButtonLink>

        <Button
          size="sm"
          onClick={() => {
            const now = new Date();
            const start = new Date(now.getTime() + (60 - now.getMinutes()) * 60_000);
            openForRange(toLocalInput(start), toLocalInput(new Date(start.getTime() + 3_600_000)));
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("addEvent")}
        </Button>
      </div>

      <CalendarFilters courses={courses} sources={sources} value={filters} onChange={setFilters} />

      <div className="bg-card rounded-xl border p-2">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxon3Plugin]}
          initialView="timeGridWeek"
          // Named zone, so the grid matches the student's profile rather than
          // whatever zone their browser happens to be in.
          timeZone={timeZone}
          locales={[svLocale]}
          locale={locale}
          // Monday-first, which is what every European academic calendar uses.
          firstDay={1}
          headerToolbar={false}
          height="auto"
          nowIndicator
          // An all-day imported event (is_all_day) needs this row to render
          // as a banner — without it, FullCalendar draws even an
          // allDay-flagged event as a midnight-to-midnight block in the
          // timed grid. See event-dto.ts and PLAN.md's Session 9 note.
          allDaySlot
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          expandRows
          selectable
          selectMirror
          editable
          eventOverlap
          events={fcEvents}
          datesSet={handleDatesSet}
          eventClick={(arg: EventClickArg) => {
            const dto = arg.event.extendedProps.dto as CalendarEventDto | undefined;
            if (dto) openForEvent(dto);
          }}
          select={(arg: DateSelectArg) => {
            openForRange(toLocalInput(arg.start), toLocalInput(arg.end));
            api()?.unselect();
          }}
          eventDrop={(arg: EventDropArg) => {
            void persistMove(arg);
          }}
          eventResize={(arg) => {
            void persistMove(arg);
          }}
        />
      </div>

      <EventFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        courses={courses}
        timeZone={timeZone}
        event={editing}
        initialRange={range}
      />
    </div>
  );

  /**
   * Persist a drag or resize, and put the event back if the write fails —
   * leaving it visually moved would tell the student something was saved when
   * it was not.
   */
  async function persistMove(arg: { event: EventClickArg["event"]; revert: () => void }) {
    const start = arg.event.start;
    const end = arg.event.end;
    if (!start || !end) {
      arg.revert();
      return;
    }

    const result = await moveEvent(arg.event.id, start.toISOString(), end.toISOString());
    if (!result.ok) {
      arg.revert();
      return;
    }

    setEvents((current) =>
      current.map((event) =>
        event.id === arg.event.id
          ? { ...event, startIso: start.toISOString(), endIso: end.toISOString() }
          : event,
      ),
    );
  }
}
