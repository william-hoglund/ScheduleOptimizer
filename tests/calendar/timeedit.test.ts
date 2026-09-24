import { describe, expect, it } from "vitest";

import { findIcsLinkInHtml } from "@/lib/calendar/timeedit";

const PAGE = "https://cloud.timeedit.net/liu/web/schema/ri1Q5.html";

describe("findIcsLinkInHtml", () => {
  it("finds a webcal subscription link and makes it fetchable", () => {
    const html = `<a class="ics" href="webcal://cloud.timeedit.net/liu/web/schema/ri1Q5.ics">Subscribe</a>`;

    expect(findIcsLinkInHtml(html, PAGE)).toBe(
      "https://cloud.timeedit.net/liu/web/schema/ri1Q5.ics",
    );
  });

  it("resolves a relative link against the page it came from", () => {
    const html = `<a href="/liu/web/schema/ri1Q5.ics?h=t">iCal</a>`;

    expect(findIcsLinkInHtml(html, PAGE)).toBe(
      "https://cloud.timeedit.net/liu/web/schema/ri1Q5.ics?h=t",
    );
  });

  it("copes with spacing and single quotes", () => {
    const html = `<link rel='alternate' href = 'https://example.edu/cal.ics' />`;

    expect(findIcsLinkInHtml(html, PAGE)).toBe("https://example.edu/cal.ics");
  });

  it("returns null when the page has no calendar in it", () => {
    expect(findIcsLinkInHtml("<html><body>Log in first</body></html>", PAGE)).toBeNull();
  });
});
