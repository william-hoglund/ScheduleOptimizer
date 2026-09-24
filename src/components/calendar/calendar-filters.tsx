"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import type { CourseRow } from "@/lib/supabase/types";
import { EVENT_TYPES } from "@/lib/validation/calendar-event";

export type CalendarFilterState = {
  courseId: string;
  eventType: string;
  /** Which imported calendar, when several timetables share one view. */
  sourceId: string;
};

export type CalendarSourceOption = { id: string; name: string };

export function CalendarFilters({
  courses,
  sources,
  value,
  onChange,
}: {
  courses: CourseRow[];
  sources: CalendarSourceOption[];
  value: CalendarFilterState;
  onChange: (next: CalendarFilterState) => void;
}) {
  const t = useTranslations("calendar.filters");
  const tTypes = useTranslations("calendar.types");

  const hasFilters = value.courseId !== "" || value.eventType !== "" || value.sourceId !== "";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <NativeSelect
        label={t("course")}
        className="w-full sm:w-56"
        value={value.courseId}
        onChange={(event) => onChange({ ...value, courseId: event.target.value })}
      >
        <option value="">{t("allCourses")}</option>
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        label={t("type")}
        className="w-full sm:w-44"
        value={value.eventType}
        onChange={(event) => onChange({ ...value, eventType: event.target.value })}
      >
        <option value="">{t("allTypes")}</option>
        {EVENT_TYPES.map((type) => (
          <option key={type} value={type}>
            {tTypes(type)}
          </option>
        ))}
      </NativeSelect>

      {/* Only worth showing once there is more than one timetable to tell apart. */}
      {sources.length > 1 ? (
        <NativeSelect
          label={t("calendar")}
          className="w-full sm:w-52"
          value={value.sourceId}
          onChange={(event) => onChange({ ...value, sourceId: event.target.value })}
        >
          <option value="">{t("allCalendars")}</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </NativeSelect>
      ) : null}

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ courseId: "", eventType: "", sourceId: "" })}
        >
          <X className="size-3.5" aria-hidden="true" />
          {t("clear")}
        </Button>
      ) : null}
    </div>
  );
}
