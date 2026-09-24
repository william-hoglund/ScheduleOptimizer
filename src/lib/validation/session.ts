import { z } from "zod";

import { V } from "./messages";

/** What happened in a study session. */
export const sessionOutcomeSchema = z
  .object({
    status: z.enum(["completed", "missed", "partial", "planned", "cancelled"]),
    completedMinutes: z.coerce.number().int().min(0, V.outOfRange).max(1440, V.outOfRange),
  })
  // A "partial" with nothing done is a miss, and a "missed" with time on it is
  // a contradiction. Catching it here keeps the statistics honest later.
  .refine((value) => value.status !== "partial" || value.completedMinutes > 0, {
    message: V.outOfRange,
    path: ["completedMinutes"],
  })
  .refine((value) => value.status !== "missed" || value.completedMinutes === 0, {
    message: V.outOfRange,
    path: ["completedMinutes"],
  });

export type SessionOutcomeInput = z.infer<typeof sessionOutcomeSchema>;

export const notificationSettingsSchema = z.object({
  sessionStarting: z.boolean(),
  sessionStartingLead: z.coerce.number().int().min(0).max(120),
  breakTime: z.boolean(),
  sessionEnded: z.boolean(),
  deadlineApproaching: z.boolean(),
  deadlineLeadDays: z.coerce.number().int().min(0).max(30),
  weeklyPlanIncomplete: z.boolean(),
  sessionMissed: z.boolean(),
  channelInApp: z.boolean(),
});

export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;
