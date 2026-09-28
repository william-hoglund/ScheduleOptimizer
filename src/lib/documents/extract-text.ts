import "server-only";

import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

/**
 * Turns an uploaded course document into plain text, one entry per page.
 *
 * Page numbers are what make source traceability (§40.11) possible — an
 * extracted requirement can say "page 8" only because this function kept
 * pages separate instead of handing the model one flattened blob. A plain
 * text or Markdown upload has no pages, so it is treated as a single page;
 * that is a real limitation for source-page references, not a null case.
 */
export type DocumentPage = {
  pageNumber: number;
  text: string;
};

export type ExtractedDocument = {
  pages: DocumentPage[];
  fullText: string;
};

export class DocumentTextExtractionError extends Error {}

const SUPPORTED_TEXT_MIME_TYPES = new Set(["text/plain", "text/markdown"]);

export async function extractDocumentText(
  bytes: Uint8Array,
  mimeType: string,
): Promise<ExtractedDocument> {
  if (mimeType === "application/pdf") {
    let pdf;
    try {
      pdf = await getDocumentProxy(bytes);
    } catch (cause) {
      throw new DocumentTextExtractionError(`Could not read PDF: ${String(cause)}`);
    }

    const { text } = await extractPdfText(pdf, { mergePages: false });
    const pages = text.map((pageText, index) => ({ pageNumber: index + 1, text: pageText }));

    return { pages, fullText: pages.map((page) => page.text).join("\n\n") };
  }

  if (SUPPORTED_TEXT_MIME_TYPES.has(mimeType)) {
    const text = new TextDecoder("utf-8").decode(bytes);
    return { pages: [{ pageNumber: 1, text }], fullText: text };
  }

  throw new DocumentTextExtractionError(`Unsupported document type: ${mimeType}`);
}
