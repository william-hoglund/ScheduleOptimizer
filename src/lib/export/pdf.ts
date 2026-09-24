import type { ExportDocument } from "./plan-layout";

/**
 * A minimal PDF writer.
 *
 * Written by hand rather than added as a dependency. A schedule is text in two
 * columns with a few rules — the smallest PDF library that does that costs
 * hundreds of kilobytes, ships its own font subsetting, and would be the only
 * part of this app that cannot be unit-tested as a pure function.
 *
 * This produces a PDF 1.4 file using the standard Helvetica faces, which every
 * reader has built in, so nothing is embedded. Text is encoded as WinAnsi,
 * which covers å, ä and ö — the reason a naïve ASCII writer would be useless
 * for a Swedish student.
 *
 * Every byte is one character of a string, which is what makes the cross
 * reference table's byte offsets computable without a binary buffer.
 */

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const TITLE_SIZE = 18;
const SUBTITLE_SIZE = 10;
const HEADING_SIZE = 11;
const ROW_SIZE = 10;
const FOOTER_SIZE = 8;

/**
 * A row is two lines: the title, and a smaller line of course and location
 * under it. 26pt is what keeps the second line clear of the row beneath —
 * anything tighter and they overlap, which a green build will never tell you.
 */
const ROW_HEIGHT_WITH_META = 26;
const ROW_HEIGHT = 20;
const HEADING_HEIGHT = 26;

const TIME_COLUMN = MARGIN;
/**
 * Wide enough for "10:15 AM–12:00 PM". An English 12-hour range is half again
 * as long as the 24-hour one, and a column sized for "08:15–09:45" puts the
 * title straight through it.
 */
const TITLE_COLUMN = MARGIN + 104;

export type PdfLabels = {
  /** "Page 1 of 3" — already translated and interpolated by the caller. */
  pageLabel: (page: number, total: number) => string;
};

/**
 * Characters outside Latin-1 that appear in this app's own output.
 *
 * The en dash is not decorative here: `cleanImportedTitle` joins timetable
 * fields with one, so without this mapping every imported lecture would show a
 * question mark in the middle of its name.
 */
const WIN_ANSI_EXTRAS = new Map<string, number>([
  ["–", 0x96],
  ["—", 0x97],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["…", 0x85],
  ["€", 0x80],
]);

function toWinAnsi(text: string): string {
  let out = "";

  for (const char of text) {
    const code = char.codePointAt(0) ?? 63;
    if (code < 256) {
      out += char;
      continue;
    }
    const mapped = WIN_ANSI_EXTRAS.get(char);
    out += mapped === undefined ? "?" : String.fromCharCode(mapped);
  }

  return out;
}

/** PDF string literals are parenthesised, so parentheses need escaping. */
function pdfString(text: string): string {
  return toWinAnsi(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Helvetica is proportional, so exact widths would need its metrics table.
 * 0.5 em per character is a deliberate slight over-estimate — text is trimmed a
 * little early rather than running past the edge of the page.
 */
function fit(text: string, maxWidth: number, fontSize: number): string {
  const maxChars = Math.floor(maxWidth / (fontSize * 0.5));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function textOp(x: number, y: number, size: number, font: "F1" | "F2", value: string): string {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfString(value)}) Tj ET\n`;
}

function grayTextOp(
  x: number,
  y: number,
  size: number,
  font: "F1" | "F2",
  value: string,
  gray: number,
): string {
  return `${gray} ${gray} ${gray} rg\n${textOp(x, y, size, font, value)}0 0 0 rg\n`;
}

function lineOp(y: number, gray: number): string {
  return `${gray} ${gray} ${gray} G 0.5 w ${MARGIN} ${y} m ${PAGE_WIDTH - MARGIN} ${y} l S\n`;
}

function renderPageContent(doc: ExportDocument, pageIndex: number, labels: PdfLabels): string {
  const days = doc.pages[pageIndex] ?? [];
  let content = "";
  let y = PAGE_HEIGHT - MARGIN;

  if (pageIndex === 0) {
    content += textOp(MARGIN, y, TITLE_SIZE, "F2", doc.title);
    y -= 18;
    content += grayTextOp(MARGIN, y, SUBTITLE_SIZE, "F1", doc.subtitle, 0.4);
    y -= 14;
    content += lineOp(y, 0.75);
    y -= 22;
  }

  if (days.length === 0) {
    content += grayTextOp(MARGIN, y, ROW_SIZE, "F1", doc.emptyLabel, 0.4);
  }

  for (const day of days) {
    content += textOp(MARGIN, y, HEADING_SIZE, "F2", day.heading);
    y -= HEADING_HEIGHT - 12;
    content += lineOp(y, 0.85);
    y -= 12;

    for (const row of day.rows) {
      content += textOp(TIME_COLUMN, y, ROW_SIZE, "F1", row.timeLabel);

      const titleWidth = CONTENT_WIDTH - (TITLE_COLUMN - MARGIN);
      content += textOp(
        TITLE_COLUMN,
        y,
        ROW_SIZE,
        row.kind === "session" ? "F2" : "F1",
        fit(row.title, titleWidth, ROW_SIZE),
      );

      if (row.meta) {
        y -= 11;
        content += grayTextOp(
          TITLE_COLUMN,
          y,
          FOOTER_SIZE,
          "F1",
          fit(row.meta, titleWidth, FOOTER_SIZE),
          0.45,
        );
        y -= ROW_HEIGHT_WITH_META - 11;
      } else {
        y -= ROW_HEIGHT;
      }
    }

    y -= 8;
  }

  content += grayTextOp(
    MARGIN,
    MARGIN - 20,
    FOOTER_SIZE,
    "F1",
    labels.pageLabel(pageIndex + 1, doc.pages.length),
    0.5,
  );

  return content;
}

/**
 * The `<ArrayBuffer>` parameter is not decoration: a plain `Uint8Array` may be
 * backed by a SharedArrayBuffer, which `Response` will not accept as a body.
 */
export function renderPdf(doc: ExportDocument, labels: PdfLabels): Uint8Array<ArrayBuffer> {
  const pageCount = doc.pages.length;

  const objects: string[] = [];
  const addObject = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  // Reserved so the page objects can reference the tree before it is written.
  const catalogId = 1;
  const pagesId = 2;
  objects.push("", "");

  const helvetica = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const helveticaBold = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );

  const pageIds: number[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    const content = renderPageContent(doc, index, labels);
    const streamId = addObject(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R ` +
        `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${helvetica} 0 R /F2 ${helveticaBold} 0 R >> >> ` +
        `/Contents ${streamId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`;

  let file = "%PDF-1.4\n";
  // A comment of high bytes marks the file as binary, so tools do not mangle it.
  file += "%âãÏÓ\n";

  const offsets: number[] = [];
  for (const [index, body] of objects.entries()) {
    offsets.push(file.length);
    file += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }

  const xrefStart = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    file += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  file +=
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;

  const bytes = new Uint8Array(new ArrayBuffer(file.length));
  for (let i = 0; i < file.length; i += 1) {
    bytes[i] = file.charCodeAt(i) & 0xff;
  }
  return bytes;
}
