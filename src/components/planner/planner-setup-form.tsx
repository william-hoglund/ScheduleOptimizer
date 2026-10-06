"use client";

import { Settings2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { FormField } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { generateDraftPlan } from "@/features/planner/actions";
import { useValidationText } from "@/features/shared/use-validation-text";
import type { CourseRow } from "@/lib/supabase/types";
import type { PlannerRunInput } from "@/lib/validation/planner";
import { cn } from "@/lib/utils";

/**
 * Choosing what to plan.
 *
 * Deliberately short. Every planning preference already lives in settings; this
 * asks only what changes run to run — the period and the focus — and hides
 * one-off overrides behind a disclosure so the common case stays two clicks.
 */

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
function startOfWeek(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const isoDay = day === 0 ? 7 : day;
  return addDays(date, 1 - isoDay);
}

export function PlannerSetupForm({
  courses,
  today,
  defaultStart,
  defaultEnd,
}: {
  courses: CourseRow[];
  today: string;
  defaultStart: string;
  defaultEnd: string;
}) {
  const t = useTranslations("planner.setup");
  const tPrefs = useTranslations("preferences");
  const message = useValidationText();

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  // All courses start selected, not just "functionally everything" via an
  // empty array — a course chip nobody can see is highlighted is a course
  // whose exclusion nobody would notice (see the planner silently narrowed
  // to a few courses with nothing due, and "nothing could be scheduled").
  // Unticking one now reads as a deliberate choice instead of a default.
  const [courseIds, setCourseIds] = useState<string[]>(() => courses.map((course) => course.id));
  const [showOverrides, setShowOverrides] = useState(false);
  const [overrides, setOverrides] = useState<PlannerRunInput["overrides"]>({});
  const [notes, setNotes] = useState("");
  const [notesUnavailable, setNotesUnavailable] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function applyPreset(preset: "week" | "nextWeek" | "fortnight") {
    const monday = startOfWeek(today);
    if (preset === "week") {
      setStartDate(today);
      setEndDate(addDays(monday, 6));
    } else if (preset === "nextWeek") {
      setStartDate(addDays(monday, 7));
      setEndDate(addDays(monday, 13));
    } else {
      setStartDate(today);
      setEndDate(addDays(today, 13));
    }
  }

  function submit() {
    setFormError(null);
    startTransition(async () => {
      const result = await generateDraftPlan({
        startDate,
        endDate,
        courseIds,
        overrides,
        notes: notes.trim() || undefined,
      });
      if (!result.ok) setFormError(result.error);
      else setNotesUnavailable(result.data.notesUnavailable);
      // On success the page re-renders with the new draft; no client navigation
      // needed because the action revalidates /planner.
    });
  }

  return (
    <section className="bg-card space-y-5 rounded-xl border p-5">
      <h2 className="text-sm font-semibold">{t("title")}</h2>

      {formError ? (
        <p role="alert" className="text-destructive text-sm">
          {message(formError)}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {(["week", "nextWeek", "fortnight"] as const).map((preset) => (
          <Button
            key={preset}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset(preset)}
          >
            {t(
              preset === "week"
                ? "quickWeek"
                : preset === "nextWeek"
                  ? "quickNextWeek"
                  : "quickFortnight",
            )}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label={t("startDate")}
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
        <FormField
          label={t("endDate")}
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
        />
      </div>

      {courses.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("courses")}</legend>
          <p className="text-muted-foreground text-xs">{t("coursesHint")}</p>
          <div className="flex flex-wrap gap-1.5">
            {courses.map((course) => {
              const selected = courseIds.includes(course.id);
              return (
                <button
                  key={course.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setCourseIds((current) =>
                      selected ? current.filter((id) => id !== course.id) : [...current, course.id],
                    )
                  }
                  className={cn(
                    "flex min-h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input text-muted-foreground hover:bg-muted",
                  )}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: course.color ?? "currentColor" }}
                    aria-hidden="true"
                  />
                  {course.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="space-y-3 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={showOverrides}
          onClick={() => setShowOverrides((value) => !value)}
        >
          <Settings2 className="size-3.5" aria-hidden="true" />
          {t("adjust")}
        </Button>

        {showOverrides ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">{t("adjustHint")}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label={tPrefs("maximumDaily")}
                type="number"
                min={15}
                max={960}
                step={15}
                value={overrides.maximumDailyMinutes ?? ""}
                onChange={(event) =>
                  setOverrides((current) => ({
                    ...current,
                    maximumDailyMinutes: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  }))
                }
              />
              <NativeSelect
                label={tPrefs("weekendAllowed")}
                value={
                  overrides.weekendAllowed === undefined ? "" : String(overrides.weekendAllowed)
                }
                onChange={(event) =>
                  setOverrides((current) => ({
                    ...current,
                    weekendAllowed:
                      event.target.value === "" ? undefined : event.target.value === "true",
                  }))
                }
              >
                <option value="">—</option>
                <option value="true">✓</option>
                <option value="false">✗</option>
              </NativeSelect>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="plan-notes" className="text-sm font-medium">
          {t("notesLabel")}
        </label>
        <Textarea
          id="plan-notes"
          rows={2}
          maxLength={600}
          placeholder={t("notesPlaceholder")}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          {notesUnavailable ? t("notesUnavailable") : t("notesHint")}
        </p>
      </div>

      <Button type="button" onClick={submit} disabled={isPending} className="w-full sm:w-auto">
        <Sparkles className="size-4" aria-hidden="true" />
        {isPending ? t("generating") : t("generate")}
      </Button>
    </section>
  );
}
