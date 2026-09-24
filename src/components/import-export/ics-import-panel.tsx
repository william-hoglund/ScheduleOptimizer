"use client";

import { CalendarCheck, CalendarPlus, Link2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

import type { CalendarSourceView } from "./calendar-source-list";
import { ImportReviewList } from "./import-review-list";
import { ButtonLink } from "@/components/common/button-link";
import { FormField } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import { confirmIcsImport, previewIcsText, previewIcsUrl } from "@/features/import-export/actions";
import {
  CALENDAR_SOURCE_KINDS,
  defaultCalendarSourceInput,
  type CalendarSourceInput,
} from "@/lib/validation/calendar-source";
import type { ImportSelection, ImportTarget } from "@/lib/validation/import-export";
import type { ImportOutcome, ImportPreview } from "@/server/import-service";

/**
 * Importing a timetable, in two steps that cannot be collapsed into one.
 *
 * A file or a URL produces a *preview*. Only a second, explicit press writes
 * anything. The brief requires that review screen, and it is what makes an
 * import from an unfamiliar university feed something a student can risk.
 */

/** Matches the server's cap. Rejecting here saves uploading megabytes to be told no. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/**
 * Every failure the two preview actions can report. Anything outside this list
 * is a bug rather than a situation, and reads as the generic message.
 */
const KNOWN_ERRORS = [
  "notCalendar",
  "invalidUrl",
  "privateAddress",
  "unreachable",
  "tooLarge",
  "invalidInput",
  "unexpected",
] as const;

type KnownError = (typeof KNOWN_ERRORS)[number];

function errorKey(code: string): KnownError {
  return (KNOWN_ERRORS as readonly string[]).includes(code) ? (code as KnownError) : "unexpected";
}

type Stage =
  | { kind: "choose" }
  | { kind: "review"; preview: ImportPreview }
  | { kind: "done"; outcome: ImportOutcome };

/** "new" means the import creates its own calendar as it goes. */
const NEW_CALENDAR = "new";

export function IcsImportPanel({
  timeZone,
  sources,
}: {
  timeZone: string;
  sources: CalendarSourceView[];
}) {
  const t = useTranslations("importExport.import");
  const tCalendars = useTranslations("importExport.calendars");
  const fileInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const [url, setUrl] = useState("");
  const [targetId, setTargetId] = useState<string>(sources[0]?.id ?? NEW_CALENDAR);
  const [newCalendar, setNewCalendar] = useState<CalendarSourceInput>(() =>
    defaultCalendarSourceInput("study"),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function show(result: Awaited<ReturnType<typeof previewIcsText>>) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setStage({ kind: "review", preview: result.data });
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      setError("tooLarge");
      return;
    }

    startTransition(async () => {
      const text = await file.text();
      show(await previewIcsText({ text, sourceId: sourceIdForPreview }));
      // Allows re-picking the same file after a failure, which otherwise fires
      // no change event at all.
      if (fileInput.current) fileInput.current.value = "";
    });
  }

  function handleUrl() {
    startTransition(async () => {
      show(await previewIcsUrl({ url, sourceId: sourceIdForPreview }));
    });
  }

  function handleConfirm(events: ImportSelection[]) {
    const target: ImportTarget =
      targetId === NEW_CALENDAR
        ? {
            newSource: {
              ...newCalendar,
              // A calendar has to be called something; the feed's own name is
              // the best guess available and the student can rename it after.
              name:
                newCalendar.name.trim() ||
                (stage.kind === "review" ? (stage.preview.calendarName ?? "") : "") ||
                t("targetNew"),
            },
          }
        : { existingSourceId: targetId };

    startTransition(async () => {
      const result = await confirmIcsImport({ events, target });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setStage({ kind: "done", outcome: result.data });
    });
  }

  const sourceIdForPreview = targetId === NEW_CALENDAR ? null : targetId;

  const errorMessage = error ? (
    <p role="alert" className="text-destructive text-sm">
      {t(`errors.${errorKey(error)}`)}
    </p>
  ) : null;

  if (stage.kind === "done") {
    return (
      <div className="space-y-4">
        <div className="border-success/40 bg-success/5 flex items-start gap-3 rounded-lg border p-4">
          <CalendarCheck className="text-success mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">{t("doneTitle")}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("doneBody", {
                inserted: stage.outcome.inserted,
                updated: stage.outcome.updated,
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/calendar">{t("viewCalendar")}</ButtonLink>
          <Button
            variant="ghost"
            onClick={() => {
              setStage({ kind: "choose" });
              setUrl("");
            }}
          >
            {t("importMore")}
          </Button>
        </div>
      </div>
    );
  }

  if (stage.kind === "review") {
    return (
      <div className="space-y-4">
        {errorMessage}

        {stage.preview.rows.length === 0 ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">{t("noEvents")}</p>
            <Button variant="outline" onClick={() => setStage({ kind: "choose" })}>
              {t("startOver")}
            </Button>
          </div>
        ) : (
          <ImportReviewList
            preview={stage.preview}
            timeZone={timeZone}
            isPending={isPending}
            onConfirm={handleConfirm}
            onCancel={() => setStage({ kind: "choose" })}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {errorMessage ? <div className="sm:col-span-2">{errorMessage}</div> : null}

      {/*
        Which calendar this goes into is asked *before* the file, not after:
        duplicate detection matches feed ids within one calendar, so it needs to
        know the answer while it is comparing.
      */}
      <div className="space-y-2 sm:col-span-2">
        <NativeSelect
          label={t("targetLabel")}
          hint={t("targetHint")}
          value={targetId}
          disabled={isPending}
          onChange={(event) => setTargetId(event.target.value)}
        >
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
          <option value={NEW_CALENDAR}>{t("targetNew")}</option>
        </NativeSelect>

        {targetId === NEW_CALENDAR ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={tCalendars("fields.name")}
              placeholder={tCalendars("fields.namePlaceholder")}
              value={newCalendar.name}
              disabled={isPending}
              onChange={(event) =>
                setNewCalendar((current) => ({ ...current, name: event.target.value }))
              }
            />
            <NativeSelect
              label={tCalendars("fields.kind")}
              hint={tCalendars("fields.effectHint")}
              value={newCalendar.kind}
              disabled={isPending}
              onChange={(event) =>
                setNewCalendar((current) => ({
                  // Kind decides the day rule, so it is re-derived rather than
                  // left at whatever the previous kind implied.
                  ...defaultCalendarSourceInput(
                    event.target.value as CalendarSourceInput["kind"],
                  ),
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

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Upload className="size-4" aria-hidden="true" />
          {t("fileTitle")}
        </h3>
        <p className="text-muted-foreground text-sm">{t("fileHint")}</p>

        <input
          ref={fileInput}
          type="file"
          accept=".ics,text/calendar"
          onChange={handleFile}
          disabled={isPending}
          aria-label={t("fileTitle")}
          className="text-muted-foreground file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
      </div>

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="size-4" aria-hidden="true" />
          {t("urlTitle")}
        </h3>
        <p className="text-muted-foreground text-sm">{t("urlHint")}</p>

        <FormField
          label={t("urlLabel")}
          type="url"
          inputMode="url"
          placeholder={t("urlPlaceholder")}
          value={url}
          disabled={isPending}
          onChange={(event) => setUrl(event.target.value)}
        />

        <Button onClick={handleUrl} disabled={isPending || url.trim().length === 0}>
          <CalendarPlus className="size-4" aria-hidden="true" />
          {isPending ? t("fetching") : t("fetch")}
        </Button>
      </div>
    </div>
  );
}
