"use server";

import { revalidatePath } from "next/cache";

import type { HorizonForecast } from "@/lib/intelligence/workload-forecast";
import { actionOk, fromZodError, guarded, type ActionResult } from "@/lib/validation/action-result";
import { whatIfRequestSchema } from "@/lib/validation/what-if";
import { requireUserContext } from "@/server/auth";
import { nowIso } from "@/server/clock";
import { setLearningProfileOverride } from "@/server/learning-profile-service";
import { getWhatIfComparison } from "@/server/what-if-service";

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

/**
 * The What-If comparison. Purely read-only — no `revalidatePath` call,
 * because nothing in the database changes when a student asks "what if".
 */
export async function compareWhatIf(
  rawInput: unknown,
): Promise<ActionResult<{ current: HorizonForecast; projected: HorizonForecast }>> {
  const { user, timeZone } = await requireUserContext();

  const parsed = whatIfRequestSchema.safeParse(rawInput);
  if (!parsed.success) return fromZodError(parsed.error);

  return guarded(() =>
    getWhatIfComparison({
      userId: user.id,
      timeZone,
      nowIso: nowIso(),
      horizonDays: parsed.data.horizonDays,
      scenario: parsed.data.scenario,
    }),
  );
}
