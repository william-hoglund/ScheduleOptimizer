"use client";

import { Camera, CalendarCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

import type { CalendarSourceView } from "./calendar-source-list";
import { ImportReviewList } from "./import-review-list";
import { ImportTargetPicker, NEW_CALENDAR, useImportTarget } from "./import-target-picker";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import {
  confirmScheduleImageImport,
  previewScheduleImageAction,
} from "@/features/import-export/actions";
import { toImportCandidates } from "@/lib/calendar/schedule-image";
import { utcToLocalDate } from "@/lib/calendar/time";
import type { ImportSelection, ImportTarget } from "@/lib/validation/import-export";
import type { ImportOutcome, ImportPreview } from "@/server/import-service";
import type { ScheduleExtraction } from "@/lib/ai";

/**
 * Import a timetable from a photo or screenshot.
 *
 * Reuses everything `.ics` import already built: `toImportCandidates`
 * (`lib/calendar/schedule-image.ts`) produces the same `ImportCandidate`
 * shape a VEVENT does, so duplicate detection, course matching, clash
 * detection and `ImportReviewList` itself are unmodified from here on.
 * The one new idea is the date range — a timetable photo names no year, so
 * the student supplies the window a weekly pattern repeats across.
 */

/** Raw upload cap, before client-side downscaling — a phone photo can be large. */
const MAX_RAW_BYTES = 20 * 1024 * 1024;
/** Long edge after downscaling. Large enough to stay legible, small enough to stay cheap and fast. */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

const KNOWN_ERRORS = [
  "tooLarge",
  "unsupportedType",
  "aiUnavailable",
  "notASchedule",
  "extractionFailed",
  "invalidInput",
  "unexpected",
] as const;
type KnownError = (typeof KNOWN_ERRORS)[number];

function errorKey(code: string): KnownError {
  return (KNOWN_ERRORS as readonly string[]).includes(code) ? (code as KnownError) : "unexpected";
}

type Stage =
  | { kind: "choose" }
  | { kind: "extracted"; extraction: ScheduleExtraction }
  | { kind: "review"; preview: ImportPreview }
  | { kind: "done"; outcome: ImportOutcome };

/** A JPEG this big after downscaling to MAX_DIMENSION is implausible — a guard, not a real limit. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

/** Downscales in the browser before anything is sent — smaller, cheaper, and faster for a vision call either way. */
async function resizeToJpegBase64(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not decode the image."));
    image.src = dataUrl;
  });

  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D context.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const resizedDataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return resizedDataUrl.slice(resizedDataUrl.indexOf(",") + 1);
}

export function ScheduleImagePanel({
  timeZone,
  sources,
}: {
  timeZone: string;
  sources: CalendarSourceView[];
}) {
  const t = useTranslations("importExport.scheduleImage");
  const tImport = useTranslations("importExport.import");
  const fileInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const today = utcToLocalDate(new Date().toISOString(), timeZone);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(() => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 90);
    return date.toISOString().slice(0, 10);
  });

  const target = useImportTarget(sources);
  const { targetId, newCalendar } = target;

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;

    if (file.size > MAX_RAW_BYTES) {
      setError("tooLarge");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("unsupportedType");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const imageBase64 = await resizeToJpegBase64(file);
        const response = await fetch("/api/calendar/schedule-image/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageBase64, mediaType: "image/jpeg" }),
        });
        const result = (await response.json()) as
          | { ok: true; data: ScheduleExtraction }
          | { ok: false; error: string };

        if (!result.ok) {
          setError(result.error);
          return;
        }
        setStage({ kind: "extracted", extraction: result.data });
      } catch (cause) {
        console.error("[schedule-image] extraction failed:", cause);
        setError("unexpected");
      }
    });
  }

  function buildPreview() {
    if (stage.kind !== "extracted") return;

    const candidates = toImportCandidates(stage.extraction.entries, { startDate, endDate }, timeZone);
    if (candidates.length === 0) {
      setError("notASchedule");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await previewScheduleImageAction({
        candidates,
        sourceId: targetId === NEW_CALENDAR ? null : targetId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStage({ kind: "review", preview: result.data });
    });
  }

  function confirm(events: ImportSelection[]) {
    const target: ImportTarget =
      targetId === NEW_CALENDAR
        ? { newSource: { ...newCalendar, name: newCalendar.name.trim() || t("targetNewFallback") } }
        : { existingSourceId: targetId };

    startTransition(async () => {
      const result = await confirmScheduleImageImport({ events, target });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setStage({ kind: "done", outcome: result.data });
    });
  }

  const errorMessage = error ? (
    <p role="alert" className="text-destructive text-sm">
      {t(`errors.${errorKey(error)}`)}
    </p>
  ) : null;

  if (stage.kind === "done") {
    return (
      <div className="space-y-4">
        <div className="border-success/40 bg-success/5 animate-in fade-in slide-in-from-bottom-2 flex items-start gap-3 rounded-lg border p-4 duration-300">
          <CalendarCheck className="text-success mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">{t("doneTitle")}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("doneBody", { inserted: stage.outcome.inserted, updated: stage.outcome.updated })}
            </p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => setStage({ kind: "choose" })}>
          {t("importMore")}
        </Button>
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
              {tImport("startOver")}
            </Button>
          </div>
        ) : (
          <ImportReviewList
            preview={stage.preview}
            timeZone={timeZone}
            isPending={isPending}
            onConfirm={confirm}
            onCancel={() => setStage({ kind: "choose" })}
          />
        )}
      </div>
    );
  }

  if (stage.kind === "extracted") {
    return (
      <div className="space-y-4">
        {errorMessage}

        {stage.extraction.imageSummary ? (
          <p className="bg-muted/50 rounded-lg p-3 text-sm">{stage.extraction.imageSummary}</p>
        ) : null}

        <p className="text-muted-foreground text-sm">
          {t("entriesFound", { count: stage.extraction.entries.length })}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t("startLabel")}
            type="date"
            value={startDate}
            disabled={isPending}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <FormField
            label={t("endLabel")}
            type="date"
            value={endDate}
            disabled={isPending}
            error={endDate < startDate ? t("endBeforeStart") : undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
        <p className="text-muted-foreground text-xs">{t("dateRangeHint")}</p>

        <ImportTargetPicker
          sources={sources}
          target={target}
          disabled={isPending}
          namePlaceholder={t("targetNewFallback")}
        />

        <div className="flex flex-wrap gap-2">
          <Button onClick={buildPreview} disabled={isPending || endDate < startDate}>
            {isPending ? t("building") : t("buildPreview")}
          </Button>
          <Button variant="ghost" onClick={() => setStage({ kind: "choose" })} disabled={isPending}>
            {tImport("startOver")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {errorMessage}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        onChange={handleFile}
        disabled={isPending}
        aria-label={t("upload")}
        className="text-muted-foreground file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />

      {isPending ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Camera className="size-3.5 shrink-0 animate-pulse" aria-hidden="true" />
          {t("reading")}
        </p>
      ) : null}
    </div>
  );
}
