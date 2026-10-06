import { describe, expect, it } from "vitest";

import { boundStudyMaterials, buildStudyHelpPrompt } from "@/lib/ai/prompts/study-help";
import { studyHelpSchema } from "@/lib/ai/schemas/study-help";
import { studyHelpRequestSchema } from "@/lib/validation/study-help";

const page = (pageNumber: number, chars: number) => ({ pageNumber, text: "x".repeat(chars) });

describe("study help", () => {
  it("keeps everything when it fits", () => {
    const result = boundStudyMaterials([{ documentName: "L1", pages: [page(1, 100), page(2, 100)] }]);
    expect(result.truncated).toBe(false);
    expect(result.materials[0]?.pages).toHaveLength(2);
  });

  it("cuts on a page boundary across documents and says so", () => {
    const result = boundStudyMaterials([
      { documentName: "L1", pages: [page(1, 30_000)] },
      { documentName: "L2", pages: [page(1, 5_000), page(2, 10_000)] },
    ]);
    expect(result.truncated).toBe(true);
    expect(result.materials.map((m) => [m.documentName, m.pages.length])).toEqual([
      ["L1", 1],
      ["L2", 1],
    ]);
  });

  it("drops blank pages (image-only slides) rather than wasting budget on them", () => {
    const result = boundStudyMaterials([{ documentName: "L1", pages: [{ pageNumber: 1, text: "  " }, page(2, 10)] }]);
    expect(result.materials[0]?.pages.map((p) => p.pageNumber)).toEqual([2]);
  });

  it("labels every page so the model can cite it", () => {
    const { prompt, system } = buildStudyHelpPrompt({
      locale: "sv",
      courseName: "Databaser",
      mode: "quiz",
      request: "",
      materials: [{ documentName: "Lecture 3.pptx", pages: [{ pageNumber: 4, text: "Joins" }] }],
    });
    expect(prompt).toContain("[Lecture 3.pptx — page 4]\nJoins");
    expect(system).toContain("Swedish");
    expect(system).toContain("Use only the material provided");
  });

  it("requires a question for explain/ask but not for summary/quiz", () => {
    const base = { courseId: crypto.randomUUID(), documentIds: [crypto.randomUUID()], request: "" };
    expect(studyHelpRequestSchema.safeParse({ ...base, mode: "summary" }).success).toBe(true);
    expect(studyHelpRequestSchema.safeParse({ ...base, mode: "ask" }).success).toBe(false);
    expect(studyHelpRequestSchema.safeParse({ ...base, mode: "ask", request: "Why?" }).success).toBe(true);
  });

  it("accepts a not-covered reply with empty fields", () => {
    const reply = { coveredByMaterial: false, title: "Not covered", sections: [], keyPoints: [], quiz: [], sources: [] };
    expect(studyHelpSchema.safeParse(reply).success).toBe(true);
  });
});
