import { getFormatter, getTranslations } from "next-intl/server";

import { wallClockToUtc } from "@/lib/calendar/time";
import type { IcsExportEvent } from "@/lib/calendar/ics-build";
import type { ExportEntry } from "@/lib/export/plan-layout";
import type { ExportItem } from "@/server/export-service";
import type { ExportRange } from "@/lib/validation/import-export";

/**
 * Turning exportable items into words: dates, times and labels in the
 * student's own language and time zone.
 *
 * Kept apart from both the services (which know only the database) and the
 * renderers in `lib/export/` (which are pure and know nothing about locales),
 * so all three exports say the same thing in the same way.
 */

/** A local date plus days, done on the calendar rather than by adding hours. */
function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * "3 August to 9 August" in the student's zone → the instants that bound it.
 *
 * The end date is inclusive on screen — asking for the 9th means you want the
 * 9th — so the window runs to the start of the following day.
 */
export function rangeToInstants(
  range: ExportRange,
  timeZone: string,
): { startIso: string; endIso: string } {
  const startIso = wallClockToUtc(`${range.startDate}T00:00`, timeZone);
  const endIso = wallClockToUtc(`${addDays(range.endDate, 1)}T00:00`, timeZone);

  if (!startIso || !endIso) {
    throw new Error(`Could not interpret the export range in ${timeZone}.`);
  }

  return { startIso, endIso };
}

export type ExportPayload = {
  title: string;
  subtitle: string;
  emptyLabel: string;
  entries: ExportEntry[];
  /** Used for the download's filename; ASCII only, so no header encoding games. */
  fileBase: string;
};

export async function buildExportPayload(
  items: readonly ExportItem[],
  range: ExportRange,
  timeZone: string,
): Promise<ExportPayload> {
  const t = await getTranslations("importExport");
  const format = await getFormatter();

  const time = (iso: string) =>
    format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone });

  const dayLabel = (iso: string) =>
    format.dateTime(new Date(iso), {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone,
    });

  /** Grouping must use the student's local date, not UTC's. */
  const dayKey = (iso: string) =>
    format.dateTime(new Date(iso), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });

  const entries: ExportEntry[] = items.map((item) => {
    const minutes = Math.round(
      (Date.parse(item.endIso) - Date.parse(item.startIso)) / 60_000,
    );

    const meta = [
      item.courseName,
      item.location,
      t("export.minutes", { minutes }),
      item.status && item.status !== "planned" ? t(`export.status.${item.status}`) : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" · ");

    return {
      dayKey: dayKey(item.startIso),
      dayLabel: dayLabel(item.startIso),
      timeLabel: `${time(item.startIso)}–${time(item.endIso)}`,
      title: item.title,
      meta,
      kind: item.kind,
    };
  });

  return {
    title: t("export.documentTitle"),
    subtitle: t("export.documentSubtitle", {
      start: format.dateTime(new Date(`${range.startDate}T12:00:00Z`), {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }),
      end: format.dateTime(new Date(`${range.endDate}T12:00:00Z`), {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    }),
    emptyLabel: t("export.nothingInRange"),
    entries,
    fileBase: `study-plan-${range.startDate}`,
  };
}

/**
 * The same items as calendar entries.
 *
 * UIDs are built from the row id so that importing an export back into this
 * app — or into Google Calendar twice — updates rather than duplicates.
 */
export function toIcsEvents(items: readonly ExportItem[]): IcsExportEvent[] {
  return items.map((item) => ({
    uid: `${item.kind}-${item.id}@ai-study-planner`,
    title: item.title,
    startIso: item.startIso,
    endIso: item.endIso,
    // A session's "description" is the engine's machine-readable reason, which
    // would be noise in a calendar app. The course name is what helps there.
    description: item.kind === "event" ? item.description : item.courseName,
    location: item.location,
    categories: item.kind === "session" ? ["STUDY"] : undefined,
  }));
}
