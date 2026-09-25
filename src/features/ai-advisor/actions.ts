"use server";

import { revalidatePath } from "next/cache";

import { defaultLocale, isLocale } from "@/i18n/config";
import type { PlanExplanation, TaskBreakdown } from "@/lib/ai";
import type { ResolvedCommand } from "@/lib/ai/resolve-command";
import type { PlannerCommand } from "@/lib/ai/schemas/advisor";
import { isSegment, type Segment } from "@/lib/segments";
import { actionFailed, actionOk, type ActionResult } from "@/lib/validation/action-result";
import {
  applyResolvedCommand,
  askAdvisor as askAdvisorService,
  createSubtasksFromBreakdown,
  generateTaskBreakdown,
  getOrCreatePlanExplanation,
} from "@/server/ai-service";
import { requireUserContext } from "@/server/auth";
import { nowIso } from "@/server/clock";
import { getProfile } from "@/server/profile-service";
import { utcToLocalDate } from "@/lib/calendar/time";

/**
 * The one place `requireUserContext()` (user + timezone) is joined with the
 * profile's locale and segment, both of which every AI prompt needs but
 * neither of which the auth layer itself carries.
 */
async function requireAiContext(): Promise<{
  userId: string;
  timeZone: string;
  locale: "en" | "sv";
  segment: Segment;
}> {
  const { user, timeZone } = await requireUserContext();
  const profile = await getProfile(user.id);

  return {
    userId: user.id,
    timeZone,
    locale: profile?.locale && isLocale(profile.locale) ? profile.locale : defaultLocale,
    segment: profile?.segment && isSegment(profile.segment) ? profile.segment : "student",
  };
}

// ------------------------------------------------------------- explanation ---

export async function explainPlanAction(planId: string): Promise<ActionResult<PlanExplanation>> {
  const ctx = await requireAiContext();

  try {
    const explanation = await getOrCreatePlanExplanation({ planId, ...ctx });
    if (!explanation) return actionFailed("aiUnavailable");
    return actionOk(explanation);
  } catch (cause) {
    console.error("[ai-advisor] explainPlanAction failed:", cause);
    return actionFailed("unexpected");
  }
}

// -------------------------------------------------------------- breakdown ---

export async function breakdownTaskAction(taskId: string): Promise<ActionResult<TaskBreakdown>> {
  const ctx = await requireAiContext();

  try {
    const breakdown = await generateTaskBreakdown({ taskId, ...ctx });
    if (!breakdown) return actionFailed("aiUnavailable");
    return actionOk(breakdown);
  } catch (cause) {
    console.error("[ai-advisor] breakdownTaskAction failed:", cause);
    return actionFailed("unexpected");
  }
}

export async function acceptTaskBreakdown(
  parentTaskId: string,
  subtasks: Array<{ title: string; estimatedMinutes: number }>,
): Promise<ActionResult<{ created: number }>> {
  const { userId, timeZone } = await requireAiContext();

  if (subtasks.length === 0) return actionFailed("invalidInput");

  const result = await createSubtasksFromBreakdown({ userId, timeZone, parentTaskId, subtasks });
  if ("error" in result) return actionFailed(result.error);

  revalidatePath("/deadlines");
  revalidatePath("/calendar");
  return actionOk(result);
}

// ---------------------------------------------------------------- advisor ---

export type AdvisorAnswer = {
  message: string;
  inScope: boolean;
  proposedAction: ResolvedCommand | null;
  /** Echoed back on confirm — see AdvisorAskResult in ai-service.ts for why. */
  rawAction: PlannerCommand;
};

export async function askAdvisorAction(message: string): Promise<ActionResult<AdvisorAnswer>> {
  const ctx = await requireAiContext();
  const today = utcToLocalDate(nowIso(), ctx.timeZone);

  const result = await askAdvisorService({ ...ctx, today, message });

  if (!result.ok) {
    return actionFailed(result.reason === "unavailable" ? "aiUnavailable" : result.reason);
  }

  return actionOk({
    message: result.message,
    inScope: result.inScope,
    proposedAction: result.resolvedAction,
    rawAction: result.rawAction,
  });
}

/** Runs a command the student has already seen and confirmed. */
export async function applyAdvisorAction(command: PlannerCommand): Promise<ActionResult<undefined>> {
  const { userId, timeZone } = await requireAiContext();

  const result = await applyResolvedCommand({ userId, timeZone, command });
  if (!result.ok) return actionFailed(result.error);

  revalidatePath("/planner");
  revalidatePath("/courses");
  revalidatePath("/calendar");
  return actionOk();
}
