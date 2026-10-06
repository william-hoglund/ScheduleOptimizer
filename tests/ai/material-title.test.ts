import { describe, expect, it } from "vitest";

import { buildMaterialTitlePrompt, fallbackMaterialTitle } from "@/lib/ai/prompts/material-title";
import { materialTitleSchema } from "@/lib/ai/schemas/material-title";

describe("titling untitled material", () => {
  it("falls back to the first meaningful line, stripped of markdown and trimmed", () => {
    expect(fallbackMaterialTitle("\n\n# Lean startup basics\nMVP means…")).toBe("Lean startup basics");
    expect(fallbackMaterialTitle("- ok\n> Customer discovery interviews")).toBe("Customer discovery interviews");
    expect(fallbackMaterialTitle("x".repeat(100))).toHaveLength(58);
    expect(fallbackMaterialTitle("  \n ab \n")).toBeNull();
  });

  it("gives the model the outline and existing names so titles match the course", () => {
    const { prompt, system } = buildMaterialTitlePrompt({
      locale: "en",
      courseName: "Entrepreneurial Engineering",
      outline: ["- 2026-10-12 Week 5: Customer discovery", "- Assessment: Pitch deck"],
      existingNames: ["Week 4 — Value proposition"],
      text: "Interview at least 10 customers…",
    });
    expect(prompt).toContain("Week 5: Customer discovery");
    expect(prompt).toContain("Week 4 — Value proposition");
    expect(system).toContain("course outline");
  });

  it("passes an uploaded file's own name as a hint, and says when to ignore it", () => {
    const { prompt, system } = buildMaterialTitlePrompt({
      locale: "en",
      courseName: "C",
      outline: [],
      existingNames: [],
      text: "…",
      originalName: "CO_ELEC4445_1_2025_Term3.pdf",
    });
    expect(prompt).toContain("Original file name: CO_ELEC4445_1_2025_Term3.pdf");
    expect(system).toContain("ignore it and title from the content");
  });

  it("caps a title at 80 characters", () => {
    expect(materialTitleSchema.safeParse({ title: "x".repeat(81) }).success).toBe(false);
  });
});
