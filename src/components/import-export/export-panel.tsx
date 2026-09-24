"use client";

import { CalendarDays, FileDown, Image as ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ButtonAnchor } from "@/components/common/button-link";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { renderPlanImage } from "@/features/import-export/actions";
import { exportSearchParams } from "@/features/import-export/export-request";

/**
 * Exporting the plan as `.ics`, PDF or PNG.
 *
 * The first two are plain links to route handlers, so the browser downloads
 * them the way it downloads anything — no fetch, no blob, and they still work
 * if the JavaScript on this page fails.
 *
 * The PNG cannot work that way: rasterising needs a renderer, and the browser
 * is the one we have. The server returns a self-contained SVG and it is drawn
 * onto a canvas here.
 */
export function ExportPanel({
  defaultStart,
  defaultEnd,
}: {
  defaultStart: string;
  defaultEnd: string;
}) {
  const t = useTranslations("importExport.export");

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [includeSessions, setIncludeSessions] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const range = { startDate, endDate, includeSessions, includeEvents };
  const invalid = endDate < startDate || (!includeSessions && !includeEvents);
  const query = invalid ? "" : exportSearchParams(range);

  function downloadPng() {
    setError(null);

    startTransition(async () => {
      const result = await renderPlanImage(range);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      try {
        await rasterise(result.data.svg, `${result.data.fileBase}.png`);
      } catch {
        setError("unexpected");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t("startLabel")}
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
        <FormField
          label={t("endLabel")}
          type="date"
          value={endDate}
          error={endDate < startDate ? t("endBeforeStart") : undefined}
          onChange={(event) => setEndDate(event.target.value)}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("includeLegend")}</legend>

        <label className="flex items-center gap-3 text-sm">
          <Checkbox checked={includeSessions} onCheckedChange={setIncludeSessions} />
          {t("includeSessions")}
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Checkbox checked={includeEvents} onCheckedChange={setIncludeEvents} />
          {t("includeEvents")}
        </label>

        {!includeSessions && !includeEvents ? (
          <p className="text-destructive text-xs">{t("pickOne")}</p>
        ) : null}
      </fieldset>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {t("failed")}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <ButtonAnchor
          href={`/api/export/ics?${query}`}
          aria-disabled={invalid || undefined}
          className={invalid ? "pointer-events-none opacity-50" : undefined}
          download
        >
          <CalendarDays className="size-4" aria-hidden="true" />
          {t("ics")}
        </ButtonAnchor>

        <ButtonAnchor
          href={`/api/export/pdf?${query}`}
          variant="outline"
          aria-disabled={invalid || undefined}
          className={invalid ? "pointer-events-none opacity-50" : undefined}
          download
        >
          <FileDown className="size-4" aria-hidden="true" />
          {t("pdf")}
        </ButtonAnchor>

        <Button variant="outline" onClick={downloadPng} disabled={invalid || isPending}>
          <ImageIcon className="size-4" aria-hidden="true" />
          {isPending ? t("rendering") : t("png")}
        </Button>
      </div>

      <p className="text-muted-foreground text-sm">{t("hint")}</p>
    </div>
  );
}

/** Twice the SVG's own size, so the PNG stays sharp on a high-density screen. */
const PIXEL_SCALE = 2;

async function rasterise(svg: string, filename: string): Promise<void> {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The image could not be drawn."));
      image.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * PIXEL_SCALE;
    canvas.height = image.naturalHeight * PIXEL_SCALE;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D context.");
    context.scale(PIXEL_SCALE, PIXEL_SCALE);
    context.drawImage(image, 0, 0);

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("The canvas produced no image.");

    const pngUrl = URL.createObjectURL(png);
    try {
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = filename;
      link.click();
    } finally {
      // Revoking immediately would cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(pngUrl), 10_000);
    }
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
