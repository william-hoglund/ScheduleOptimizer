import { strFromU8, unzipSync } from "fflate";

/**
 * Reads the text of a .pptx deck, one entry per slide, in slide order.
 *
 * A .pptx is a zip of XML parts; each slide's visible text lives in `<a:t>`
 * runs inside `ppt/slides/slideN.xml`. Kept free of `server-only` so it can be
 * unit-tested directly — `extract-text.ts` is the server entry point.
 *
 * Slide order is taken from the file names' numbers, which is how PowerPoint
 * itself names them. A deck whose slides were reordered after creation can
 * differ from presentation order; the text is still all there, which is what
 * study help needs.
 */
export function extractPptxSlides(bytes: Uint8Array): { pageNumber: number; text: string }[] {
  const files = unzipSync(bytes, {
    filter: (file) => /^ppt\/slides\/slide\d+\.xml$/.test(file.name),
  });

  return Object.entries(files)
    .map(([name, data]) => ({
      pageNumber: Number(/slide(\d+)\.xml$/.exec(name)?.[1] ?? 0),
      text: slideXmlToText(strFromU8(data)),
    }))
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

/** Each paragraph (`<a:p>`) becomes a line; runs within it are joined. */
export function slideXmlToText(xml: string): string {
  return xml
    .split(/<\/a:p>/)
    .map((paragraph) =>
      [...paragraph.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((match) => decodeXml(match[1] ?? "")).join(""),
    )
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}
