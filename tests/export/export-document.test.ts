import { describe, expect, it } from "vitest";

import { buildExportDocument, type ExportEntry } from "@/lib/export/plan-layout";
import { renderPdf } from "@/lib/export/pdf";
import { renderPlanSvg } from "@/lib/export/plan-svg";

function entries(count: number, dayCount = 1): ExportEntry[] {
  return Array.from({ length: count }, (_, index) => {
    const day = (index % dayCount) + 1;
    return {
      dayKey: `2026-08-${String(day).padStart(2, "0")}`,
      dayLabel: `Day ${day}`,
      timeLabel: `${String(8 + Math.floor(index / dayCount)).padStart(2, "0")}:00`,
      title: `Session ${index + 1}`,
      meta: "Databases · 90 min",
      kind: "session" as const,
    };
  });
}

const labels = { pageLabel: (page: number, total: number) => `Page ${page} of ${total}` };

describe("buildExportDocument", () => {
  it("groups entries into days in chronological order", () => {
    const doc = buildExportDocument({
      title: "Study plan",
      subtitle: "1–7 August",
      emptyLabel: "Nothing scheduled",
      entries: [
        {
          dayKey: "2026-08-05",
          dayLabel: "Wednesday",
          timeLabel: "09:00",
          title: "Later day",
          meta: "",
          kind: "event",
        },
        {
          dayKey: "2026-08-03",
          dayLabel: "Monday",
          timeLabel: "13:00",
          title: "Afternoon",
          meta: "",
          kind: "session",
        },
        {
          dayKey: "2026-08-03",
          dayLabel: "Monday",
          timeLabel: "08:00",
          title: "Morning",
          meta: "",
          kind: "session",
        },
      ],
    });

    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]?.map((day) => day.heading)).toEqual(["Monday", "Wednesday"]);
    expect(doc.pages[0]?.[0]?.rows.map((row) => row.title)).toEqual(["Morning", "Afternoon"]);
  });

  it("keeps every row when a day spills onto a second page", () => {
    const doc = buildExportDocument({
      title: "Study plan",
      subtitle: "",
      emptyLabel: "",
      entries: entries(30),
      rowsPerPage: 10,
    });

    const rendered = doc.pages.flat().reduce((sum, day) => sum + day.rows.length, 0);
    // The failure this guards against is silent: rows falling off the bottom of
    // a page and simply not being in the file.
    expect(rendered).toBe(30);
    expect(doc.pages.length).toBeGreaterThan(1);
    expect(doc.pages[1]?.[0]?.continued).toBe(true);
  });

  it("never leaves a day heading stranded at the foot of a page", () => {
    const doc = buildExportDocument({
      title: "Study plan",
      subtitle: "",
      emptyLabel: "",
      entries: entries(12, 6),
      rowsPerPage: 5,
    });

    for (const page of doc.pages) {
      for (const day of page) {
        expect(day.rows.length).toBeGreaterThan(0);
      }
    }
  });

  it("returns one empty page when there is nothing to export", () => {
    const doc = buildExportDocument({
      title: "Study plan",
      subtitle: "",
      emptyLabel: "Nothing scheduled",
      entries: [],
    });

    expect(doc.totalRows).toBe(0);
    expect(doc.pages).toEqual([[]]);
  });

  it("puts everything on one page when told not to paginate", () => {
    const doc = buildExportDocument({
      title: "Study plan",
      subtitle: "",
      emptyLabel: "",
      entries: entries(60, 7),
      rowsPerPage: Infinity,
    });

    expect(doc.pages).toHaveLength(1);
  });
});

describe("renderPdf", () => {
  const doc = buildExportDocument({
    title: "Studieplan",
    subtitle: "3–9 augusti",
    emptyLabel: "Inget schemalagt",
    entries: entries(40, 5),
    rowsPerPage: 12,
  });

  const bytes = renderPdf(doc, labels);
  const text = new TextDecoder("latin1").decode(bytes);

  it("produces a file a reader will accept", () => {
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Type /Catalog");
  });

  it("writes one page object per page of the document", () => {
    const pageObjects = text.match(/\/Type \/Page[^s]/g) ?? [];
    expect(pageObjects).toHaveLength(doc.pages.length);
    expect(text).toContain(`/Count ${doc.pages.length}`);
  });

  it("points the cross reference table at the real byte offsets", () => {
    // A wrong offset here is the classic way to produce a PDF that looks fine
    // in one reader and refuses to open in another.
    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");

    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(0);
    for (const [index, offset] of offsets.entries()) {
      expect(text.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true);
    }
  });

  it("encodes Swedish characters rather than dropping them", () => {
    // "å" is 0xE5 in WinAnsi. A UTF-8 writer would emit two bytes here and the
    // reader would show "Ã¥".
    const withSwedish = renderPdf(
      buildExportDocument({
        title: "Måndag är övning",
        subtitle: "",
        emptyLabel: "",
        entries: [],
      }),
      labels,
    );

    const decoded = new TextDecoder("latin1").decode(withSwedish);
    expect(decoded).toContain("Måndag är övning");
  });

  it("escapes parentheses in a title", () => {
    const withParens = renderPdf(
      buildExportDocument({
        title: "Databaser (TDDD37)",
        subtitle: "",
        emptyLabel: "",
        entries: [],
      }),
      labels,
    );

    expect(new TextDecoder("latin1").decode(withParens)).toContain("(Databaser \\(TDDD37\\))");
  });
});

describe("renderPlanSvg", () => {
  const doc = buildExportDocument({
    title: "Study plan",
    subtitle: "3–9 August",
    emptyLabel: "Nothing scheduled",
    entries: entries(6, 3),
    rowsPerPage: Infinity,
  });

  it("declares an explicit size, without which the browser rasterises nothing", () => {
    const svg = renderPlanSvg(doc);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+"/);
  });

  it("references nothing outside itself", () => {
    const svg = renderPlanSvg(doc);
    // An external font or stylesheet is refused inside an <img>, and can taint
    // the canvas so toBlob() throws. The SVG namespace is a name, not a URL the
    // browser fetches, so it is the one http:// allowed here.
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(/https?:\/\//);
    expect(svg).not.toContain("href");
    expect(svg).not.toContain("@import");
    expect(svg).not.toContain("<image");
  });

  it("escapes markup in a title", () => {
    const svg = renderPlanSvg(
      buildExportDocument({
        title: "Maths & <script>",
        subtitle: "",
        emptyLabel: "",
        entries: [],
        rowsPerPage: Infinity,
      }),
    );

    expect(svg).toContain("Maths &amp; &lt;script&gt;");
    expect(svg).not.toContain("<script>");
  });
});
