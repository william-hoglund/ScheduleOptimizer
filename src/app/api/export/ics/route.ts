import type { NextRequest } from "next/server";

import { buildIcs } from "@/lib/calendar/ics-build";
import { parseExportParams } from "@/features/import-export/export-request";
import { rangeToInstants, toIcsEvents } from "@/features/import-export/export-format";
import { requireUserContext } from "@/server/auth";
import { nowIso } from "@/server/clock";
import { loadExportItems } from "@/server/export-service";
import { getTranslations } from "next-intl/server";

/**
 * The study plan as a `.ics` file.
 *
 * A route handler rather than a Server Action because the browser has to
 * receive it as a *download* — Actions return values to JavaScript, not files.
 * The rule from §9.7 holds: forms use Actions, machines use routes, and both go
 * through the same services.
 */
export async function GET(request: NextRequest) {
  // Redirects signed-out visitors; RLS is the backstop underneath.
  const { user, timeZone } = await requireUserContext();

  const range = parseExportParams(request.nextUrl.searchParams);
  if (!range) {
    return new Response("Invalid export range", { status: 400 });
  }

  const t = await getTranslations("importExport");
  const { startIso, endIso } = rangeToInstants(range, timeZone);

  const items = await loadExportItems(user.id, {
    startIso,
    endIso,
    includeSessions: range.includeSessions,
    includeEvents: range.includeEvents,
  });

  const body = buildIcs(toIcsEvents(items), {
    calendarName: t("export.calendarName"),
    nowIso: nowIso(),
    timeZone,
  });

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="study-plan-${range.startDate}.ics"`,
      // Someone else's schedule must never be served from a cache.
      "cache-control": "no-store, private",
    },
  });
}
