"use server";

import { revalidatePath } from "next/cache";

import { buildExportPayload, rangeToInstants } from "./export-format";
import { buildExportDocument } from "@/lib/export/plan-layout";
import { renderPlanSvg } from "@/lib/export/plan-svg";
import {
  actionFailed,
  actionOk,
  fromZodError,
  guarded,
  type ActionResult,
} from "@/lib/validation/action-result";
import {
  exportRangeSchema,
  googleImportRequestSchema,
  icsPreviewSchema,
  icsUrlPreviewSchema,
  importRequestSchema,
} from "@/lib/validation/import-export";
import { calendarSourceSchema } from "@/lib/validation/calendar-source";
import { requireUserContext } from "@/server/auth";
import {
  createCalendarSource,
  deleteCalendarSource,
  markImported,
  updateCalendarSource,
} from "@/server/calendar-source-service";
import { nowIso } from "@/server/clock";
import { loadExportItems } from "@/server/export-service";
import { fetchIcsFromUrl } from "@/server/ics-fetch";
import { defaultCalendarSourceInput } from "@/lib/validation/calendar-source";
import { ensureFreshAccessToken, fetchGoogleImportCandidates } from "@/server/google-calendar-service";
import { disconnectGoogleCalendar } from "@/server/google-connection-service";
import {
  findGoogleCalendarSourceId,
  GOOGLE_CALENDAR_SOURCE_NAME,
  previewGoogleImport,
  previewIcsImport,
  saveImportedEvents,
  type ImportOutcome,
  type ImportPreview,
} from "@/server/import-service";

/**
 * Import and export.
 *
 * The shape of the import is deliberately two-step: **preview, then confirm.**
 * The first call parses and returns what *would* happen; nothing is written
 * until the student sends back the rows they ticked.
 *
 * That second call re-validates everything with Zod rather than trusting the
 * browser to return what it was given. The data belongs to the student either
 * way, but a server that writes whatever arrives is one bug away from writing
 * whatever arrives *from someone else*.
 */

export async function previewIcsText(input: unknown): Promise<ActionResult<ImportPreview>> {
  const { user, timeZone } = await requireUserContext();

  const parsed = icsPreviewSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  if (!parsed.data.text.includes("BEGIN:VCALENDAR")) {
    return actionFailed("notCalendar");
  }

  return guarded(() =>
    previewIcsImport(user.id, timeZone, parsed.data.text, parsed.data.sourceId),
  );
}

export async function previewIcsUrl(
  input: unknown,
): Promise<ActionResult<ImportPreview & { sourceUrl: string }>> {
  const { user, timeZone } = await requireUserContext();

  const parsed = icsUrlPreviewSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const fetched = await fetchIcsFromUrl(parsed.data.url);
  if (!fetched.ok) return actionFailed(fetched.error);

  const preview = await guarded(() =>
    previewIcsImport(user.id, timeZone, fetched.text, parsed.data.sourceId),
  );
  if (!preview.ok) return preview;

  return actionOk({ ...preview.data, sourceUrl: fetched.sourceUrl });
}

export async function confirmIcsImport(input: unknown): Promise<ActionResult<ImportOutcome>> {
  const { user, timeZone } = await requireUserContext();

  const parsed = importRequestSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(async () => {
    const { target, events } = parsed.data;

    // Creating the calendar here, in the same action, is what stops a failed
    // second step leaving an empty calendar behind.
    const sourceId =
      "existingSourceId" in target
        ? target.existingSourceId
        : (await createCalendarSource(user.id, target.newSource, null)).id;

    const outcome = await saveImportedEvents(user.id, timeZone, events, sourceId);
    await markImported(user.id, sourceId, nowIso());
    return outcome;
  });
  if (!result.ok) return result;

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/import-export");
  return result;
}

/**
 * Google Calendar: the same preview-then-confirm shape as `.ics`, just with
 * no file or URL to supply — the events come from the student's already
 * -connected account instead.
 */

export async function previewGoogleSync(): Promise<ActionResult<ImportPreview>> {
  const { user, timeZone } = await requireUserContext();

  const access = await ensureFreshAccessToken(user.id);
  if (!access.ok) return actionFailed(access.error);

  return guarded(async () => {
    const candidates = await fetchGoogleImportCandidates(access.accessToken, timeZone);
    return previewGoogleImport(user.id, candidates);
  });
}

export async function confirmGoogleImport(input: unknown): Promise<ActionResult<ImportOutcome>> {
  const { user, timeZone } = await requireUserContext();

  const parsed = googleImportRequestSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(async () => {
    const existingSourceId = await findGoogleCalendarSourceId(user.id);
    const sourceId =
      existingSourceId ??
      (
        await createCalendarSource(
          user.id,
          { ...defaultCalendarSourceInput("personal"), name: GOOGLE_CALENDAR_SOURCE_NAME },
          null,
        )
      ).id;

    const outcome = await saveImportedEvents(user.id, timeZone, parsed.data.events, sourceId, "google");
    await markImported(user.id, sourceId, nowIso());
    return outcome;
  });
  if (!result.ok) return result;

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/import-export");
  return result;
}

export async function disconnectGoogleAction(): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => disconnectGoogleCalendar(user.id));
  if (!result.ok) return result;

  revalidatePath("/import-export");
  return actionOk();
}

/** Editing a calendar's day rule — what a day full of it does to studying. */
export async function saveCalendarSource(
  sourceId: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireUserContext();

  const parsed = calendarSourceSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(async () =>
    sourceId
      ? await updateCalendarSource(user.id, sourceId, parsed.data)
      : await createCalendarSource(user.id, parsed.data, null),
  );
  if (!result.ok) return result;

  revalidatePath("/import-export");
  revalidatePath("/planner");
  return actionOk({ id: result.data.id });
}

export async function removeCalendarSource(
  sourceId: string,
  withEvents: boolean,
): Promise<ActionResult<{ deletedEvents: number }>> {
  const { user } = await requireUserContext();

  const result = await guarded(() =>
    deleteCalendarSource(user.id, sourceId, { withEvents }),
  );
  if (!result.ok) return result;

  revalidatePath("/import-export");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return result;
}

/**
 * The plan as an SVG, for the browser to rasterise into a PNG.
 *
 * The image is drawn client-side because turning a document into pixels needs a
 * renderer, and the browser already is one. The server's job stops at producing
 * a self-contained SVG — see `lib/export/plan-svg.ts`.
 */
export async function renderPlanImage(
  input: unknown,
): Promise<ActionResult<{ svg: string; fileBase: string }>> {
  const { user, timeZone } = await requireUserContext();

  const parsed = exportRangeSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  return guarded(async () => {
    const { startIso, endIso } = rangeToInstants(parsed.data, timeZone);

    const items = await loadExportItems(user.id, {
      startIso,
      endIso,
      includeSessions: parsed.data.includeSessions,
      includeEvents: parsed.data.includeEvents,
    });

    const payload = await buildExportPayload(items, parsed.data, timeZone);
    const document = buildExportDocument({ ...payload, rowsPerPage: Infinity });

    return { svg: renderPlanSvg(document), fileBase: payload.fileBase };
  });
}
