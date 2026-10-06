"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import type { CalendarSourceView } from "./calendar-source-list";
import { FormField } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import {
  CALENDAR_SOURCE_KINDS,
  defaultCalendarSourceInput,
  type CalendarSourceInput,
} from "@/lib/validation/calendar-source";

/**
 * "Which calendar does this import go into?" — shared by the `.ics` and photo
 * import panels, which asked it identically before this was extracted.
 */

/** "new" means the import creates its own calendar as it goes. */
export const NEW_CALENDAR = "new";

export function useImportTarget(sources: CalendarSourceView[]) {
  const [rawTargetId, setTargetId] = useState<string>(sources[0]?.id ?? NEW_CALENDAR);
  const [newCalendar, setNewCalendar] = useState<CalendarSourceInput>(() =>
    defaultCalendarSourceInput("study"),
  );

  // `sources` can change under the caller (a calendar gets deleted or added
  // elsewhere, then the page revalidates) without it remounting, so a
  // `targetId` picked before that happened can point at a calendar that no
  // longer exists — an id that still round-trips the select's value prop but
  // fails the insert's foreign key on confirm. Derived during render, rather
  // than synced back with an effect, per React's "adjusting state when a
  // prop changes" guidance: there is no real choice to preserve once the
  // calendar it names is gone.
  const targetId =
    rawTargetId === NEW_CALENDAR || sources.some((source) => source.id === rawTargetId)
      ? rawTargetId
      : (sources[0]?.id ?? NEW_CALENDAR);

  return { targetId, setTargetId, newCalendar, setNewCalendar };
}

export function ImportTargetPicker({
  sources,
  target,
  disabled,
  namePlaceholder,
}: {
  sources: CalendarSourceView[];
  target: ReturnType<typeof useImportTarget>;
  disabled: boolean;
  namePlaceholder: string;
}) {
  const tImport = useTranslations("importExport.import");
  const tCalendars = useTranslations("importExport.calendars");
  const { targetId, setTargetId, newCalendar, setNewCalendar } = target;

  return (
    <div className="space-y-2">
      <NativeSelect
        label={tImport("targetLabel")}
        hint={tImport("targetHint")}
        value={targetId}
        disabled={disabled}
        onChange={(event) => setTargetId(event.target.value)}
      >
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.name}
          </option>
        ))}
        <option value={NEW_CALENDAR}>{tImport("targetNew")}</option>
      </NativeSelect>

      {targetId === NEW_CALENDAR ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={tCalendars("fields.name")}
            placeholder={namePlaceholder}
            value={newCalendar.name}
            disabled={disabled}
            onChange={(event) =>
              setNewCalendar((current) => ({ ...current, name: event.target.value }))
            }
          />
          <NativeSelect
            label={tCalendars("fields.kind")}
            hint={tCalendars("fields.effectHint")}
            value={newCalendar.kind}
            disabled={disabled}
            onChange={(event) =>
              setNewCalendar((current) => ({
                // Kind decides the day rule, so it is re-derived rather than
                // left at whatever the previous kind implied.
                ...defaultCalendarSourceInput(event.target.value as CalendarSourceInput["kind"]),
                name: current.name,
              }))
            }
          >
            {CALENDAR_SOURCE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {tCalendars(`kinds.${kind}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
    </div>
  );
}
