"use client";

import { GraduationCap } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { createCoursesFromCodes } from "@/features/courses/actions";
import type { CandidateStatus } from "@/lib/calendar/detect-duplicates";
import type { ImportSelection } from "@/lib/validation/import-export";
import type { ImportPreview } from "@/server/import-service";

/**
 * The review screen: what an import *would* do, before it does it.
 *
 * The brief makes this mandatory, and it is the reason the whole feature is
 * safe to use. A student can see every event, what type it was guessed to be,
 * which course it matched, and whether it is already on their calendar — and
 * untick anything.
 *
 * Rows that would duplicate something start unticked. That makes re-importing a
 * corrected timetable the easy path rather than the dangerous one.
 */

type PreviewRow = ImportPreview["rows"][number];
/** code -> the course just created for it, kept client-side so a row can be
 *  re-matched the instant "Add courses" returns, with no second preview fetch. */
type CourseOverrides = Record<string, { id: string; name: string }>;

const STATUS_VARIANT: Record<CandidateStatus, "default" | "secondary" | "outline"> = {
  new: "default",
  alreadyImported: "secondary",
  matchesExisting: "secondary",
  repeatedInFile: "outline",
};

export function ImportReviewList({
  preview,
  timeZone,
  isPending,
  onConfirm,
  onCancel,
}: {
  preview: ImportPreview;
  timeZone: string;
  isPending: boolean;
  onConfirm: (events: ImportSelection[]) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("importExport.import");
  const tCalendar = useTranslations("calendar");
  const format = useFormatter();

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(preview.rows.filter((row) => row.selectedByDefault).map((row) => row.externalId)),
  );
  const [isFixed, setIsFixed] = useState(true);
  const [courseOverrides, setCourseOverrides] = useState<CourseOverrides>({});
  // Ticked by default, like every other "new" row here — a course code a real
  // timetable export produced is almost always genuinely the student's own.
  const [tickedCodes, setTickedCodes] = useState<Set<string>>(() => {
    const codes = new Set<string>();
    for (const row of preview.rows) {
      if (!row.courseId && row.courseCode) codes.add(row.courseCode);
    }
    return codes;
  });
  const [addCoursesError, setAddCoursesError] = useState<string | null>(null);
  const [isAddingCourses, startAddingCourses] = useTransition();

  // Every course code the import spotted that matches nothing the student
  // already has — "{code} — no course yet" on the row badge below. Surfaced
  // once, deduplicated, with a direct way to fix the gap rather than leaving
  // it as a dozen identical badges with nothing to do about them.
  const unmatchedCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const row of preview.rows) {
      if (!row.courseId && row.courseCode && !courseOverrides[row.courseCode]) {
        codes.add(row.courseCode);
      }
    }
    return [...codes];
  }, [preview.rows, courseOverrides]);

  function toggleCode(code: string) {
    setTickedCodes((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function addCourses() {
    const codes = unmatchedCodes.filter((code) => tickedCodes.has(code));
    if (codes.length === 0) return;

    setAddCoursesError(null);
    startAddingCourses(async () => {
      const result = await createCoursesFromCodes(codes);
      if (!result.ok) {
        setAddCoursesError(result.error);
        return;
      }

      setCourseOverrides((current) => {
        const next = { ...current };
        for (const course of result.data) next[course.code] = { id: course.id, name: course.name };
        return next;
      });
      setTickedCodes((current) => {
        const next = new Set(current);
        for (const course of result.data) next.delete(course.code);
        return next;
      });
    });
  }

  /** A row's real course, once a just-created one is folded in. */
  function effectiveCourse(row: PreviewRow): { id: string | null; name: string | null } {
    const override = row.courseCode ? courseOverrides[row.courseCode] : undefined;
    if (override) return { id: override.id, name: override.name };
    return { id: row.courseId, name: row.courseName };
  }

  const byDay = useMemo(() => {
    const groups = new Map<string, PreviewRow[]>();

    for (const row of preview.rows) {
      // Grouped by the student's local date, not UTC's.
      const key = format.dateTime(new Date(row.startIso), {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone,
      });
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    return [...groups.entries()];
  }, [preview.rows, format, timeZone]);

  function toggle(externalId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(externalId)) next.delete(externalId);
      else next.add(externalId);
      return next;
    });
  }

  function confirm() {
    const events: ImportSelection[] = preview.rows
      .filter((row) => selected.has(row.externalId))
      .map((row) => ({
        externalId: row.externalId,
        title: row.title,
        startIso: row.startIso,
        endIso: row.endIso,
        isAllDay: row.isAllDay,
        location: row.location,
        description: row.description,
        eventType: row.eventType,
        courseId: effectiveCourse(row).id,
        isFixed,
        existingEventId: row.existingEventId,
      }));

    onConfirm(events);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            {preview.calendarName ?? t("reviewTitle")}
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            <span className="text-numeric">
              {t("summary", {
                total: preview.counts.total,
                added: preview.counts.new,
                known: preview.counts.duplicate,
              })}
            </span>
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelected(new Set(preview.rows.map((row) => row.externalId)))}
            disabled={isPending}
          >
            {t("selectAll")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={isPending}>
            {t("selectNone")}
          </Button>
        </div>
      </div>

      {preview.counts.clashing > 0 ? (
        <p className="border-warning/40 bg-warning/5 rounded-lg border p-3 text-sm">
          {t("clashSummary", { count: preview.counts.clashing })}
        </p>
      ) : null}

      {preview.warnings.length > 0 ? (
        <ul className="border-warning/40 bg-warning/5 space-y-1 rounded-lg border p-3 text-sm">
          {preview.warnings.map((warning) => (
            <li key={warning.code} className="text-muted-foreground">
              {t(`warnings.${warning.code}`, { count: warning.count })}
            </li>
          ))}
        </ul>
      ) : null}

      {unmatchedCodes.length > 0 ? (
        <div className="border-primary/30 bg-primary/5 space-y-2.5 rounded-lg border p-3">
          <div className="flex items-start gap-2.5">
            <GraduationCap className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">{t("newCourses.title")}</p>
              <p className="text-muted-foreground mt-0.5 text-sm">{t("newCourses.body")}</p>
            </div>
          </div>

          {addCoursesError ? (
            <p role="alert" className="text-destructive text-sm">
              {t("newCourses.failed")}
            </p>
          ) : null}

          <ul className="flex flex-wrap gap-2">
            {unmatchedCodes.map((code) => (
              <li key={code}>
                <label className="bg-card hover:bg-muted/40 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm">
                  <Checkbox
                    checked={tickedCodes.has(code)}
                    onCheckedChange={() => toggleCode(code)}
                    disabled={isAddingCourses}
                  />
                  <span className="text-numeric">{code}</span>
                </label>
              </li>
            ))}
          </ul>

          <Button
            size="sm"
            onClick={addCourses}
            disabled={isAddingCourses || tickedCodes.size === 0}
          >
            {isAddingCourses
              ? t("newCourses.adding")
              : t("newCourses.add", { count: tickedCodes.size })}
          </Button>
        </div>
      ) : null}

      <label className="flex items-start gap-3">
        <Switch checked={isFixed} onCheckedChange={setIsFixed} aria-label={t("fixedLabel")} />
        <span>
          <span className="block text-sm font-medium">{t("fixedLabel")}</span>
          <span className="text-muted-foreground block text-xs">{t("fixedHint")}</span>
        </span>
      </label>

      <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
        {byDay.map(([day, rows]) => (
          <section key={day} className="space-y-1.5">
            <h4 className="label-caps">{day}</h4>

            <ul className="space-y-1.5">
              {rows.map((row) => {
                const course = effectiveCourse(row);

                return (
                  <li key={row.externalId}>
                    <label className="bg-card hover:bg-muted/40 flex items-start gap-3 rounded-lg border p-3">
                      <Checkbox
                        className="mt-1"
                        checked={selected.has(row.externalId)}
                        onCheckedChange={() => toggle(row.externalId)}
                        disabled={isPending}
                      />

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-numeric text-sm font-medium">
                            {row.isAllDay
                              ? t("allDay")
                              : `${format.dateTime(new Date(row.startIso), {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone,
                                })}–${format.dateTime(new Date(row.endIso), {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone,
                                })}`}
                          </span>
                          <span className="text-sm">{row.title}</span>
                        </span>

                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline">{tCalendar(`types.${row.eventType}`)}</Badge>

                          {course.name ? (
                            <Badge variant="secondary">{course.name}</Badge>
                          ) : row.courseCode ? (
                            <Badge variant="outline">{t("courseUnmatched", { code: row.courseCode })}</Badge>
                          ) : null}

                          {row.status === "new" ? null : (
                            <Badge variant={STATUS_VARIANT[row.status]}>
                              {t(`status.${row.status}`)}
                            </Badge>
                          )}

                          {row.clashesWith.map((other) => (
                            <Badge key={other.id} variant="destructive">
                              {t("clash", { title: other.title })}
                            </Badge>
                          ))}

                          {row.location ? (
                            <span className="text-muted-foreground text-xs">{row.location}</span>
                          ) : null}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={confirm} disabled={isPending || selected.size === 0}>
          {isPending ? t("confirming") : t("confirm", { count: selected.size })}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={isPending}>
          {t("startOver")}
        </Button>
      </div>
    </div>
  );
}
