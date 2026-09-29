"use server";

import { revalidatePath } from "next/cache";

import { actionOk, guarded, type ActionResult } from "@/lib/validation/action-result";
import { requireUserContext } from "@/server/auth";
import { setLearningProfileOverride } from "@/server/learning-profile-service";

/**
 * "Not accurate for me" / "Undo" on a Personal Learning Profile insight.
 * Dismissal is the override the brief asks for — see
 * `learning-profile-service.ts` for why there is no separate replacement
 * value to set.
 */

async function setOverride(insightId: string, overridden: boolean): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => setLearningProfileOverride(user.id, insightId, overridden));
  if (!result.ok) return result;

  revalidatePath("/insights");
  return actionOk();
}

export async function dismissLearningInsight(insightId: string): Promise<ActionResult<undefined>> {
  return setOverride(insightId, true);
}

export async function restoreLearningInsight(insightId: string): Promise<ActionResult<undefined>> {
  return setOverride(insightId, false);
}
