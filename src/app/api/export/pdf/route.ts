import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { buildExportPayload, rangeToInstants } from "@/features/import-export/export-format";
import { parseExportParams } from "@/features/import-export/export-request";
import { buildExportDocument } from "@/lib/export/plan-layout";
import { renderPdf } from "@/lib/export/pdf";
import { requireUserContext } from "@/server/auth";
import { loadExportItems } from "@/server/export-service";

/** The study plan as a printable PDF. See the `.ics` route for why this is a route. */
export async function GET(request: NextRequest) {
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

  const payload = await buildExportPayload(items, range, timeZone);

  const bytes = renderPdf(buildExportDocument(payload), {
    pageLabel: (page, total) => t("export.pageLabel", { page, total }),
  });

  return new Response(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${payload.fileBase}.pdf"`,
      "content-length": String(bytes.byteLength),
      "cache-control": "no-store, private",
    },
  });
}
