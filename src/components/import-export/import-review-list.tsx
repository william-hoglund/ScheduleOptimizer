"use client";

import { GraduationCap, Pencil } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createCoursesFromCodes } from "@/features/courses/actions";
import type { CandidateStatus } from "@/lib/calendar/detect-duplicates";
import { recurrenceGroupKey } from "@/lib/calendar/recurrence-group";
import { utcToLocalDate, utcToWallClock, wallClockToUtc } from "@/lib/calendar/time";
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
/** externalId -> a hand-corrected start/end, kept client-side the same way —
 *  the AI or feed got a row's time wrong, the student fixed it here. */
type TimeOverride = { startIso: string; endIso: string; isAllDay: boolean };
type TimeOverrides = Record<string, TimeOverride>;
/** A wall-clock draft mid-edit, before "Save" turns it back into instants. */
type EditDraft = { date: string; startTime: string; endTime: string };
/** Offered after saving a time edit on a row that has siblings in the same
 *  recurring series — the student's correction, waiting to be applied (or
 *  not) to the rest of the series. */
type PendingPropagation = { title: string; startTime: string; endTime: string; siblingIds: string[] };
/** Two rows in *this* import that overlap — one decision per clashing pair of
 *  series, not one per overlapping occurrence (a weekly clash would otherwise
 *  mean the same question forty times). */
type ClashPrompt = { pairKey: string; rowA: PreviewRow; rowB: PreviewRow };

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

  const [timeOverrides, setTimeOverrides] = useState<TimeOverrides>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [pendingPropagation, setPendingPropagation] = useState<PendingPropagation | null>(null);

  /** A row's effective start/end/all-day — the hand-corrected version once edited. */
  function effectiveTimes(row: PreviewRow): TimeOverride {
    return timeOverrides[row.externalId] ?? { startIso: row.startIso, endIso: row.endIso, isAllDay: row.isAllDay };
  }

  function timeRangeLabel(times: TimeOverride): string {
    if (times.isAllDay) return t("allDay");
    return `${format.dateTime(new Date(times.startIso), {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    })}–${format.dateTime(new Date(times.endIso), {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    })}`;
  }

  function startEdit(row: PreviewRow) {
    const times = effectiveTimes(row);
    // An all-day row has no real clock time to prefill — a sane default
    // beats forcing the student to type one from scratch.
    const startTime = times.isAllDay ? "09:00" : utcToWallClock(times.startIso, timeZone).slice(11);
    const endTime = times.isAllDay ? "10:00" : utcToWallClock(times.endIso, timeZone).slice(11);
    setEditingId(row.externalId);
    setEditError(null);
    setEditDraft({ date: utcToLocalDate(times.startIso, timeZone), startTime, endTime });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
  }

  function saveEdit(row: PreviewRow) {
    if (!editDraft) return;

    const newStartIso = wallClockToUtc(`${editDraft.date}T${editDraft.startTime}`, timeZone);
    const newEndIso = wallClockToUtc(`${editDraft.date}T${editDraft.endTime}`, timeZone);
    if (!newStartIso || !newEndIso || Date.parse(newEndIso) <= Date.parse(newStartIso)) {
      setEditError(t("editRow.invalidRange"));
      return;
    }

    const times = effectiveTimes(row);
    const timeOfDayChanged =
      times.isAllDay ||
      utcToWallClock(times.startIso, timeZone).slice(11) !== editDraft.startTime ||
      utcToWallClock(times.endIso, timeZone).slice(11) !== editDraft.endTime;

    const groupKey = recurrenceGroupKey(row.externalId);
    const siblingIds = groupKey
      ? preview.rows
          .filter((other) => other.externalId !== row.externalId && recurrenceGroupKey(other.externalId) === groupKey)
          .map((other) => other.externalId)
      : [];

    setTimeOverrides((current) => ({
      ...current,
      [row.externalId]: { startIso: newStartIso, endIso: newEndIso, isAllDay: false },
    }));
    cancelEdit();

    if (timeOfDayChanged && siblingIds.length > 0) {
      setPendingPropagation({
        title: row.title,
        startTime: editDraft.startTime,
        endTime: editDraft.endTime,
        siblingIds,
      });
    }
  }

  /** Applies (or declines) the pending time correction across the rest of the series. */
  function resolvePropagation(apply: boolean) {
    if (apply && pendingPropagation) {
      setTimeOverrides((current) => {
        const next = { ...current };
        for (const id of pendingPropagation.siblingIds) {
          const row = preview.rows.find((candidate) => candidate.externalId === id);
          if (!row) continue;

          // Each sibling keeps its own date — only the time of day moves.
          const siblingTimes = next[id] ?? { startIso: row.startIso, endIso: row.endIso, isAllDay: row.isAllDay };
          const date = utcToLocalDate(siblingTimes.startIso, timeZone);
          const newStartIso = wallClockToUtc(`${date}T${pendingPropagation.startTime}`, timeZone);
          const newEndIso = wallClockToUtc(`${date}T${pendingPropagation.endTime}`, timeZone);
          if (newStartIso && newEndIso && Date.parse(newEndIso) > Date.parse(newStartIso)) {
            next[id] = { startIso: newStartIso, endIso: newEndIso, isAllDay: false };
          }
        }
        return next;
      });
    }
    setPendingPropagation(null);
  }

  // One decision per clashing pair of *series* in this import — a weekly
  // clash between two courses would otherwise ask the same question once per
  // overlapping week. Only pairs where both sides are rows in this import are
  // offered a choice; a clash against an event already on the calendar has no
  // second row here to drop, so it stays the passive badge below.
  const [clashResolutions, setClashResolutions] = useState<Record<string, "rowA" | "rowB" | "both">>({});

  const clashPrompts = useMemo(() => {
    const byExternalId = new Map(preview.rows.map((row) => [row.externalId, row]));
    const seenPairs = new Set<string>();
    const prompts: ClashPrompt[] = [];

    for (const row of preview.rows) {
      for (const clash of row.clashesWith) {
        if (!clash.id.startsWith("incoming:")) continue;
        const other = byExternalId.get(clash.id.slice("incoming:".length));
        if (!other) continue;

        const groupA = recurrenceGroupKey(row.externalId) ?? row.externalId;
        const groupB = recurrenceGroupKey(other.externalId) ?? other.externalId;
        if (groupA === groupB) continue;

        const pairKey = [groupA, groupB].sort().join("|");
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        prompts.push({ pairKey, rowA: row, rowB: other });
      }
    }

    return prompts;
  }, [preview.rows]);

  const unresolvedClash = clashPrompts.find((prompt) => !(prompt.pairKey in clashResolutions)) ?? null;

  function resolveClash(prompt: ClashPrompt, choice: "rowA" | "rowB" | "both") {
    setClashResolutions((current) => ({ ...current, [prompt.pairKey]: choice }));
    if (choice === "both") return;

    const dropped = choice === "rowA" ? prompt.rowB : prompt.rowA;
    const dropGroup = recurrenceGroupKey(dropped.externalId) ?? dropped.externalId;

    // Every occurrence of the series the student didn't pick, not just the
    // one pair of rows that happened to trigger the question.
    setSelected((current) => {
      const next = new Set(current);
      for (const row of preview.rows) {
        if ((recurrenceGroupKey(row.externalId) ?? row.externalId) === dropGroup) next.delete(row.externalId);
      }
      return next;
    });
  }

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
      // Grouped by the student's local date, not UTC's — and by the edited
      // date once a row has been hand-corrected onto a different day.
      const startIso = timeOverrides[row.externalId]?.startIso ?? row.startIso;
      const key = format.dateTime(new Date(startIso), {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone,
      });
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    return [...groups.entries()];
  }, [preview.rows, format, timeZone, timeOverrides]);

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
      .map((row) => {
        const times = effectiveTimes(row);
        return {
          externalId: row.externalId,
          title: row.title,
          startIso: times.startIso,
          endIso: times.endIso,
          isAllDay: times.isAllDay,
          location: row.location,
          description: row.description,
          eventType: row.eventType,
          courseId: effectiveCourse(row).id,
          isFixed,
          existingEventId: row.existingEventId,
        };
      });

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
                const times = effectiveTimes(row);
                const isEditing = editingId === row.externalId;

                return (
                  <li key={row.externalId}>
                    <div className="bg-card hover:bg-muted/40 flex items-start gap-3 rounded-lg border p-3">
                      <label className="flex min-w-0 flex-1 items-start gap-3">
                        <Checkbox
                          className="mt-1"
                          checked={selected.has(row.externalId)}
                          onCheckedChange={() => toggle(row.externalId)}
                          disabled={isPending || isEditing}
                        />

                        <span className="min-w-0 flex-1">
                          {isEditing && editDraft ? (
                            <span className="flex flex-col items-start gap-2">
                              <span className="text-sm font-medium">{row.title}</span>
                              <span className="flex flex-wrap gap-2">
                                <Input
                                  type="date"
                                  value={editDraft.date}
                                  onChange={(event) =>
                                    setEditDraft((current) => current && { ...current, date: event.target.value })
                                  }
                                  className="w-auto"
                                  aria-label={t("editRow.dateLabel")}
                                />
                                <Input
                                  type="time"
                                  value={editDraft.startTime}
                                  onChange={(event) =>
                                    setEditDraft(
                                      (current) => current && { ...current, startTime: event.target.value },
                                    )
                                  }
                                  className="w-auto"
                                  aria-label={t("editRow.startLabel")}
                                />
                                <Input
                                  type="time"
                                  value={editDraft.endTime}
                                  onChange={(event) =>
                                    setEditDraft(
                                      (current) => current && { ...current, endTime: event.target.value },
                                    )
                                  }
                                  className="w-auto"
                                  aria-label={t("editRow.endLabel")}
                                />
                              </span>
                              {editError ? (
                                <span role="alert" className="text-destructive text-xs">
                                  {editError}
                                </span>
                              ) : null}
                              <span className="flex gap-2">
                                <Button type="button" size="sm" onClick={() => saveEdit(row)}>
                                  {t("editRow.save")}
                                </Button>
                                <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                                  {t("editRow.cancel")}
                                </Button>
                              </span>
                            </span>
                          ) : (
                            <>
                              <span className="flex flex-wrap items-baseline gap-x-2">
                                <span className="text-numeric text-sm font-medium">{timeRangeLabel(times)}</span>
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
                            </>
                          )}
                        </span>
                      </label>

                      {isEditing ? null : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          onClick={(event) => {
                            event.preventDefault();
                            startEdit(row);
                          }}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                          <span className="sr-only">{t("editRow.edit")}</span>
                        </Button>
                      )}
                    </div>
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

      <Dialog
        open={pendingPropagation !== null}
        onOpenChange={(open) => !open && resolvePropagation(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("propagate.title")}</DialogTitle>
            <DialogDescription>
              {pendingPropagation
                ? t("propagate.body", {
                    title: pendingPropagation.title,
                    count: pendingPropagation.siblingIds.length,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => resolvePropagation(false)} disabled={isPending}>
              {t("propagate.justThis")}
            </Button>
            <Button onClick={() => resolvePropagation(true)} disabled={isPending}>
              {pendingPropagation
                ? t("propagate.applyToAll", { count: pendingPropagation.siblingIds.length })
                : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={unresolvedClash !== null}
        onOpenChange={(open) => !open && unresolvedClash && resolveClash(unresolvedClash, "both")}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("clashPrompt.title")}</DialogTitle>
            <DialogDescription>
              {unresolvedClash
                ? t("clashPrompt.body", { titleA: unresolvedClash.rowA.title, titleB: unresolvedClash.rowB.title })
                : ""}
            </DialogDescription>
          </DialogHeader>

          {unresolvedClash ? (
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => resolveClash(unresolvedClash, "rowA")}
              >
                {t("clashPrompt.keep", {
                  title: unresolvedClash.rowA.title,
                  time: timeRangeLabel(effectiveTimes(unresolvedClash.rowA)),
                })}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => resolveClash(unresolvedClash, "rowB")}
              >
                {t("clashPrompt.keep", {
                  title: unresolvedClash.rowB.title,
                  time: timeRangeLabel(effectiveTimes(unresolvedClash.rowB)),
                })}
              </Button>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => unresolvedClash && resolveClash(unresolvedClash, "both")}>
              {t("clashPrompt.keepBoth")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
