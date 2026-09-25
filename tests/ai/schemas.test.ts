import { z } from "zod";
import { describe, expect, it } from "vitest";

import { boundAdvisorContext } from "@/lib/ai/prompts/advisor";
import { boundExplainPlanSessions, type ExplainPlanSession } from "@/lib/ai/prompts/explain-plan";
import { advisorReplySchema } from "@/lib/ai/schemas/advisor";
import { planExplanationSchema } from "@/lib/ai/schemas/explain-plan";
import { taskBreakdownSchema } from "@/lib/ai/schemas/task-breakdown";

type JsonSchemaNode = {
  type?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  allOf?: JsonSchemaNode[];
  $defs?: Record<string, JsonSchemaNode>;
};

/**
 * OpenAI's strict Structured Outputs mode requires every object schema, at
 * every level of nesting — including inside a discriminated union's branches
 * — to list *all* its properties as required (true-optional fields are not
 * representable). A schema that violates this only fails when a real request
 * is made, which is a bad time to find out `advisorReplySchema`'s nested
 * `action` union has a loose branch. Walking the whole tree here catches it
 * before that.
 */
function assertFullyRequired(node: JsonSchemaNode, path = "root") {
  if (node.type === "object" && node.properties) {
    const keys = Object.keys(node.properties);
    expect(node.required, `${path}: every property must be required`).toEqual(keys);
    for (const [key, child] of Object.entries(node.properties)) {
      assertFullyRequired(child, `${path}.${key}`);
    }
  }
  if (node.items) assertFullyRequired(node.items, `${path}[]`);
  for (const branch of [...(node.anyOf ?? []), ...(node.oneOf ?? []), ...(node.allOf ?? [])]) {
    assertFullyRequired(branch, `${path}(union)`);
  }
  if (node.$defs) {
    for (const [name, def] of Object.entries(node.$defs)) {
      assertFullyRequired(def, `$defs.${name}`);
    }
  }
}

describe("AI response schemas produce valid, strict-mode-safe JSON Schema", () => {
  it.each([
    ["planExplanationSchema", planExplanationSchema],
    ["taskBreakdownSchema", taskBreakdownSchema],
    ["advisorReplySchema", advisorReplySchema],
  ])("%s", (_name, schema) => {
    const jsonSchema = z.toJSONSchema(schema) as JsonSchemaNode;
    assertFullyRequired(jsonSchema);
  });
});

describe("advisorReplySchema", () => {
  it("accepts each command kind the advisor can propose", () => {
    for (const action of [
      { kind: "none" as const },
      { kind: "set_course_priority" as const, courseId: "c1", priority: 3 as const, label: "x" },
      {
        kind: "regenerate_plan" as const,
        courseIds: ["c1"],
        timeframe: "current_plan" as const,
        label: "x",
      },
    ]) {
      const result = advisorReplySchema.safeParse({ inScope: true, message: "ok", action });
      expect(result.success).toBe(true);
    }
  });

  it("rejects a priority outside 1-5", () => {
    const result = advisorReplySchema.safeParse({
      inScope: true,
      message: "ok",
      action: { kind: "set_course_priority", courseId: "c1", priority: 9, label: "x" },
    });
    expect(result.success).toBe(false);
  });
});

describe("boundExplainPlanSessions", () => {
  const session = (i: number): ExplainPlanSession => ({
    title: `Session ${i}`,
    courseName: null,
    startLocal: "2026-09-23T09:00",
    minutes: 60,
    reasonCode: "first_available",
  });

  it("passes a short list through untouched", () => {
    const result = boundExplainPlanSessions([session(1), session(2)]);
    expect(result.sessions).toHaveLength(2);
    expect(result.sessionsTruncated).toBe(false);
  });

  it("caps a long list and flags the truncation, rather than growing the prompt unbounded", () => {
    const many = Array.from({ length: 60 }, (_, i) => session(i));
    const result = boundExplainPlanSessions(many);
    expect(result.sessions.length).toBeLessThan(60);
    expect(result.sessionsTruncated).toBe(true);
  });
});

describe("boundAdvisorContext", () => {
  it("caps both lists independently", () => {
    const courses = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, priority: 3 }));
    const tasks = Array.from({ length: 30 }, (_, i) => ({
      id: `t${i}`,
      title: `T${i}`,
      courseName: null,
      deadlineLocal: null,
      priority: 3,
    }));

    const result = boundAdvisorContext(courses, tasks);
    expect(result.courses.length).toBeLessThan(30);
    expect(result.upcomingTasks.length).toBeLessThan(30);
  });
});
