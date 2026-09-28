import { z } from "zod";
import { describe, expect, it } from "vitest";

import { oneOfToAnyOf } from "@/lib/ai/json-schema";
import { boundAdvisorContext } from "@/lib/ai/prompts/advisor";
import { boundExplainPlanSessions, type ExplainPlanSession } from "@/lib/ai/prompts/explain-plan";
import { advisorReplySchema } from "@/lib/ai/schemas/advisor";
import { courseExtractionSchema } from "@/lib/ai/schemas/course-extraction";
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
    ["courseExtractionSchema", courseExtractionSchema],
  ])("%s", (_name, schema) => {
    const jsonSchema = z.toJSONSchema(schema) as JsonSchemaNode;
    assertFullyRequired(jsonSchema);
  });
});

/**
 * `z.discriminatedUnion` always compiles to `oneOf`, and OpenAI's strict mode
 * rejects `oneOf` outright ("'oneOf' is not permitted") — a real 400 from a
 * live call in Session 15, on `advisorReplySchema` specifically, since it's
 * the only schema here with a union in it. Caught only by an actual request
 * with real credits; `assertFullyRequired` above ran the same schema through
 * `z.toJSONSchema` and saw nothing wrong, because "every property required"
 * and "no oneOf" are independent constraints. `oneOfToAnyOf` is what
 * `providers/openai.ts` applies before sending; this asserts it actually
 * removes every occurrence, anywhere in the tree, not just at the top level.
 */
function containsOneOf(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(containsOneOf);
  if (node && typeof node === "object") {
    return Object.entries(node).some(([key, value]) => key === "oneOf" || containsOneOf(value));
  }
  return false;
}

describe("oneOfToAnyOf", () => {
  it("confirms the bug exists: a raw discriminated-union schema contains oneOf", () => {
    const raw = z.toJSONSchema(advisorReplySchema);
    expect(containsOneOf(raw)).toBe(true);
  });

  it("removes every oneOf, at any depth, for every schema this app sends to OpenAI", () => {
    for (const schema of [planExplanationSchema, taskBreakdownSchema, advisorReplySchema]) {
      const openAiSchema = oneOfToAnyOf(z.toJSONSchema(schema));
      expect(containsOneOf(openAiSchema)).toBe(false);
    }
  });

  it("preserves the rest of the schema, including nested oneOf-turned-anyOf branches", () => {
    const result = oneOfToAnyOf(z.toJSONSchema(advisorReplySchema)) as unknown as {
      properties: { action: { anyOf: Array<{ properties: { kind: { const: string } } }> } };
    };
    const kinds = result.properties.action.anyOf.map((branch) => branch.properties.kind.const);
    expect(kinds.sort()).toEqual(["none", "regenerate_plan", "set_course_priority"]);
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
