import { z } from "zod";

/**
 * The What-If comparison form. Client input is never trusted directly — the
 * server action re-validates it here before it ever reaches
 * `getWhatIfComparison`, same discipline as every other form in this app.
 */

export const whatIfHorizonSchema = z.union([z.literal(7), z.literal(14), z.literal(30)]);

export const whatIfScenarioSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("skip_day"),
    dayOfWeek: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
      z.literal(7),
    ]),
  }),
  z.object({
    kind: z.literal("extra_commitment"),
    hours: z.number().min(0).max(80),
  }),
]);

export const whatIfRequestSchema = z.object({
  horizonDays: whatIfHorizonSchema,
  scenario: whatIfScenarioSchema,
});

export type WhatIfRequest = z.infer<typeof whatIfRequestSchema>;
