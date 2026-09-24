"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import type { CalendarSourceView } from "./calendar-source-list";
import { FormField } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import { saveCalendarSource } from "@/features/import-export/actions";
import { useValidationText } from "@/features/shared/use-validation-text";
import {
  CALENDAR_SOURCE_KINDS,
  DAY_EFFECTS,
  defaultCalendarSourceInput,
  type CalendarSourceInput,
} from "@/lib/validation/calendar-source";

/**
 * Naming a calendar and deciding what a day of it costs.
 *
 * The threshold is the field that carries the idea: a rule that fired on any
 * event at all would cancel studying because of a fifteen-minute call, and a
 * rule that never fires leaves the student planning revision for an evening
 * they will spend on the sofa.
 */
export function CalendarSourceForm({
  source,
  onDone,
  onCancel,
}: {
  source?: CalendarSourceView;
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("importExport.calendars");
  const message = useValidationText();

  const [value, setValue] = useState<CalendarSourceInput>(() =>
    source
      ? {
          name: source.name,
          kind: source.kind,
          dayEffect: source.dayEffect,
          thresholdMinutes: source.thresholdMinutes,
          reducedDailyMinutes: source.reducedDailyMinutes,
        }
      : defaultCalendarSourceInput("study"),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof CalendarSourceInput>(key: K, next: CalendarSourceInput[K]) {
    setValue((current) => ({ ...current, [key]: next }));
  }

  /**
   * Changing what a calendar *is* re-suggests what it does, because that is the
   * answer in almost every case — a job takes the day, a timetable does not.
   * The name is kept: it was the student's.
   */
  function changeKind(kind: CalendarSourceInput["kind"]) {
    setValue((current) => ({ ...defaultCalendarSourceInput(kind), name: current.name }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveCalendarSource(source?.id ?? null, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone(result.data.id);
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {message(error)}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t("fields.name")}
          placeholder={t("fields.namePlaceholder")}
          value={value.name}
          autoFocus
          onChange={(event) => set("name", event.target.value)}
        />

        <NativeSelect
          label={t("fields.kind")}
          value={value.kind}
          onChange={(event) => changeKind(event.target.value as CalendarSourceInput["kind"])}
        >
          {CALENDAR_SOURCE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kinds.${kind}`)}
            </option>
          ))}
        </NativeSelect>
      </div>

      <NativeSelect
        label={t("fields.effect")}
        hint={t("fields.effectHint")}
        value={value.dayEffect}
        onChange={(event) => set("dayEffect", event.target.value as CalendarSourceInput["dayEffect"])}
      >
        {DAY_EFFECTS.map((effect) => (
          <option key={effect} value={effect}>
            {t(`effects.${effect}`)}
          </option>
        ))}
      </NativeSelect>

      {value.dayEffect === "none" ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t("fields.threshold")}
            hint={t("fields.thresholdHint")}
            type="number"
            min={1}
            max={24}
            step={0.5}
            value={value.thresholdMinutes / 60}
            onChange={(event) =>
              set("thresholdMinutes", Math.round(Number(event.target.value) * 60))
            }
          />

          {value.dayEffect === "reduce" ? (
            <FormField
              label={t("fields.reduced")}
              hint={t("fields.reducedHint")}
              type="number"
              min={0}
              max={480}
              step={15}
              value={value.reducedDailyMinutes}
              onChange={(event) => set("reducedDailyMinutes", Number(event.target.value))}
            />
          ) : null}
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={isPending || value.name.trim().length === 0}>
          {isPending ? t("saving") : t("save")}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={isPending}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
