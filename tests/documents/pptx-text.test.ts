import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { extractPptxSlides, slideXmlToText } from "@/lib/documents/pptx-text";

const slide = (...paragraphs: string[][]) =>
  `<p:sld><p:cSld><p:spTree>${paragraphs
    .map((runs) => `<a:p>${runs.map((run) => `<a:r><a:t>${run}</a:t></a:r>`).join("")}</a:p>`)
    .join("")}</p:spTree></p:cSld></p:sld>`;

describe("pptx text extraction", () => {
  it("reads every slide, in numeric order (slide10 after slide2)", () => {
    const bytes = zipSync({
      "ppt/slides/slide10.xml": strToU8(slide(["Ten"])),
      "ppt/slides/slide2.xml": strToU8(slide(["Two"])),
      "ppt/slides/slide1.xml": strToU8(slide(["One"])),
      "ppt/slides/_rels/slide1.xml.rels": strToU8("<Relationships/>"),
      "ppt/presentation.xml": strToU8("<p:presentation/>"),
    });

    expect(extractPptxSlides(bytes)).toEqual([
      { pageNumber: 1, text: "One" },
      { pageNumber: 2, text: "Two" },
      { pageNumber: 10, text: "Ten" },
    ]);
  });

  it("joins runs within a paragraph, puts paragraphs on separate lines, decodes entities", () => {
    const xml = slide(["Normal", " forms"], ["2NF &amp; 3NF &lt;keys&gt;"], []);
    expect(slideXmlToText(xml)).toBe("Normal forms\n2NF & 3NF <keys>");
  });

  it("throws on something that isn't a zip", () => {
    expect(() => extractPptxSlides(strToU8("not a deck"))).toThrow();
  });
});
