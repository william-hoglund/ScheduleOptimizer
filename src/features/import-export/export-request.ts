import { exportRangeSchema, type ExportRange } from "@/lib/validation/import-export";

/**
 * Reading an export range off a query string.
 *
 * The two export routes are plain links — `<a href="/api/export/pdf?…">` — so
 * that a download is a download, with no JavaScript between the click and the
 * file. That means the range arrives as text and has to be validated exactly as
 * carefully as a form post would be.
 */
export function parseExportParams(params: URLSearchParams): ExportRange | null {
  const parsed = exportRangeSchema.safeParse({
    startDate: params.get("start") ?? "",
    endDate: params.get("end") ?? "",
    // Absent means included: a bare link exports everything in the range.
    includeSessions: params.get("sessions") !== "0",
    includeEvents: params.get("events") !== "0",
  });

  return parsed.success ? parsed.data : null;
}

export function exportSearchParams(range: ExportRange): string {
  return new URLSearchParams({
    start: range.startDate,
    end: range.endDate,
    sessions: range.includeSessions ? "1" : "0",
    events: range.includeEvents ? "1" : "0",
  }).toString();
}
