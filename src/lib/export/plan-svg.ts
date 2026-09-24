import type { ExportDocument } from "./plan-layout";

/**
 * The same document as an SVG, which the browser rasterises into the PNG.
 *
 * Why this route: turning a DOM node into an image needs either a headless
 * browser on the server or a library that re-implements CSS layout in the
 * client. Drawing an SVG we control onto a canvas needs neither, and the SVG is
 * a pure string — so the layout is testable in the same way everything else is.
 *
 * Two constraints an SVG destined for `drawImage` must respect:
 *  - **No external references.** No stylesheet, no web font, no `<img>`. The
 *    browser refuses to load them from inside an image, and on some engines it
 *    taints the canvas so `toBlob` then fails.
 *  - **Explicit width and height.** Without them the intrinsic size is
 *    undefined and Chrome rasterises nothing at all.
 *
 * Colours are literal rather than the app's CSS variables: a PNG has no theme
 * to follow, and a screenshot with a transparent background is worse than
 * useless once it lands in a chat window.
 */

const WIDTH = 820;
const PADDING = 40;
const ROW_HEIGHT = 34;
const HEADING_HEIGHT = 44;
const HEADER_HEIGHT = 96;

/** Sized for the longest time label there is: "10:15 AM–12:00 PM". */
const TIME_COLUMN = 16;
const TITLE_COLUMN = 150;
const FOOTER_HEIGHT = 32;

const INK = "#1f2433";
const MUTED = "#5b6172";
const RULE = "#e3e2de";
const PAPER = "#ffffff";
const SESSION = "#5b4bc4";

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Same reasoning as the PDF: proportional font, so trim a little early. */
function fit(text: string, maxWidth: number, fontSize: number): string {
  const maxChars = Math.floor(maxWidth / (fontSize * 0.55));
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function text(
  x: number,
  y: number,
  value: string,
  { size = 14, fill = INK, weight = 400, anchor = "start" } = {},
): string {
  return (
    `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" ` +
    `font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(value)}</text>`
  );
}

/**
 * One tall image containing every day — pagination is a paper concern.
 * Build the document with `rowsPerPage: Infinity` before calling this.
 */
export function renderPlanSvg(doc: ExportDocument): string {
  const days = doc.pages.flat();
  const rowCount = days.reduce((sum, day) => sum + day.rows.length, 0);

  const height =
    HEADER_HEIGHT +
    days.length * HEADING_HEIGHT +
    rowCount * ROW_HEIGHT +
    FOOTER_HEIGHT +
    (days.length === 0 ? ROW_HEIGHT : 0);

  const parts: string[] = [
    `<rect width="${WIDTH}" height="${height}" fill="${PAPER}"/>`,
    text(PADDING, 52, doc.title, { size: 24, weight: 600 }),
    text(PADDING, 74, doc.subtitle, { size: 13, fill: MUTED }),
    `<line x1="${PADDING}" y1="${HEADER_HEIGHT - 8}" x2="${WIDTH - PADDING}" ` +
      `y2="${HEADER_HEIGHT - 8}" stroke="${RULE}" stroke-width="1"/>`,
  ];

  let y = HEADER_HEIGHT + 24;

  if (days.length === 0) {
    parts.push(text(PADDING, y, doc.emptyLabel, { size: 14, fill: MUTED }));
  }

  for (const day of days) {
    parts.push(text(PADDING, y, day.heading, { size: 15, weight: 600 }));
    parts.push(
      `<line x1="${PADDING}" y1="${y + 10}" x2="${WIDTH - PADDING}" y2="${y + 10}" ` +
        `stroke="${RULE}" stroke-width="1"/>`,
    );
    y += HEADING_HEIGHT;

    for (const row of day.rows) {
      const isSession = row.kind === "session";

      parts.push(
        `<rect x="${PADDING}" y="${y - 14}" width="3" height="20" rx="1.5" ` +
          `fill="${isSession ? SESSION : RULE}"/>`,
      );
      parts.push(text(PADDING + TIME_COLUMN, y, row.timeLabel, { size: 13, fill: MUTED }));
      parts.push(
        text(PADDING + TITLE_COLUMN, y, fit(row.title, 290, 14), {
          size: 14,
          weight: isSession ? 600 : 400,
        }),
      );
      if (row.meta) {
        parts.push(
          text(WIDTH - PADDING, y, fit(row.meta, 300, 12), {
            size: 12,
            fill: MUTED,
            anchor: "end",
          }),
        );
      }

      y += ROW_HEIGHT;
    }

    y += 10;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" ` +
    `viewBox="0 0 ${WIDTH} ${height}">${parts.join("")}</svg>`
  );
}
