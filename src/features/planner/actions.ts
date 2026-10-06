"use server";

import { revalidatePath } from "next/cache";

import { interpretPlanNotes, isAiEnabled } from "@/lib/ai";
import { applyPlanNotes } from "@/lib/planner/apply-plan-notes";
import { generatePlan } from "@/lib/planner/generate-plan";
import { epochMinutesToLocalDate } from "@/lib/planner/time-grid";
import { actionOk, fromZodError, guarded, type ActionResult } from "@/lib/validation/action-result";
import { plannerRunSchema } from "@/lib/validation/planner";
import { requireUserContext } from "@/server/auth";
import { nowIso } from "@/server/clock";
import {
  approvePlan,
  buildPlannerInput,
  discardPlan,
  moveStudySession,
  rejectSession,
  saveDraftPlan,
  setSessionLocked,
} from "@/server/planner-service";

/**
 * Generating and reviewing a plan.
 *
 * Every generated plan is saved as a **draft**. Nothing appears on the
 * student's real calendar until they approve it.
 */

export async function generateDraftPlan(
  rawInput: unknown,
): Promise<ActionResult<{ planId: string; notesUnavailable: boolean }>> {
  const { user, timeZone } = await requireUserContext();

  const parsed = plannerRunSchema.safeParse(rawInput);
  if (!parsed.success) return fromZodError(parsed.error);

  const options = parsed.data;

  return guarded(async () => {
    const now = nowIso();
    // A stable default seed means regenerating without asking for an
    // alternative gives the same plan back, which is far less confusing.
    const seed = options.seed ?? `${options.startDate}:${options.endDate}`;

    const { input: baseInput, courses } = await buildPlannerInput({
      userId: user.id,
      timeZone,
      horizon: { startDate: options.startDate, endDate: options.endDate },
      nowIso: now,
      seed,
      courseFilter: options.courseIds,
    });

    // The student's note, turned into hard rules. Without AI (or if the model
    // fails) the plan still generates — the note just can't be applied, and
    // the form says so.
    let input = baseInput;
    let notesUnavailable = false;
    if (options.notes) {
      const interpretation = isAiEnabled()
        ? await interpretPlanNotes({
            note: options.notes,
            today: epochMinutesToLocalDate(baseInput.now, timeZone),
            horizonStart: options.startDate,
            horizonEnd: options.endDate,
            tasks: baseInput.tasks.map((task) => ({
              id: task.id,
              title: task.title,
              courseName: courses.find((course) => course.id === task.courseId)?.name ?? null,
              deadline: task.deadline === null ? null : epochMinutesToLocalDate(task.deadline, timeZone),
            })),
          })
        : null;
      if (interpretation) {
        const notes = applyPlanNotes(baseInput, interpretation);
        input = { ...notes.input, planNotes: { text: options.notes, applied: notes.applied, rejected: notes.rejected } };
      } else {
        notesUnavailable = true;
      }
    }

    // One-off adjustments, applied on top of saved preferences without
    // changing them.
    const withOverrides = {
      ...input,
      preferences: { ...input.preferences, ...stripUndefined(options.overrides) },
    };

    const startedAt = performance.now();
    const result = generatePlan(withOverrides);
    const durationMs = performance.now() - startedAt;

    const { planId } = await saveDraftPlan({
      userId: user.id,
      horizon: { startDate: options.startDate, endDate: options.endDate },
      result,
      input: withOverrides,
      durationMs,
    });

    revalidatePath("/planner");
    return { planId, notesUnavailable };
  });
}

/** Same options, different seed — the "show me another option" button. */
export async function generateAlternativePlan(
  rawInput: unknown,
  previousPlanId: string,
): Promise<ActionResult<{ planId: string; notesUnavailable: boolean }>> {
  const { user } = await requireUserContext();

  const parsed = plannerRunSchema.safeParse(rawInput);
  if (!parsed.success) return fromZodError(parsed.error);

  // The rejected draft is thrown away first, so drafts do not pile up.
  await guarded(() => discardPlan(user.id, previousPlanId));

  return generateDraftPlan({
    ...parsed.data,
    seed: `${parsed.data.startDate}:${Date.now().toString(36)}`,
  });
}

export async function approveDraftPlan(planId: string): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => approvePlan(user.id, planId));
  if (!result.ok) return result;

  revalidatePath("/planner");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return actionOk();
}

export async function discardDraftPlan(planId: string): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => discardPlan(user.id, planId));
  if (!result.ok) return result;

  revalidatePath("/planner");
  return actionOk();
}

export async function rejectProposedSession(sessionId: string): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => rejectSession(user.id, sessionId));
  if (!result.ok) return result;

  revalidatePath("/planner");
  return actionOk();
}

export async function toggleSessionLock(
  sessionId: string,
  isLocked: boolean,
): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => setSessionLocked(user.id, sessionId, isLocked));
  if (!result.ok) return result;

  revalidatePath("/planner");
  revalidatePath("/calendar");
  return actionOk();
}

export async function moveProposedSession(
  sessionId: string,
  startIso: string,
  endIso: string,
): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: "invalidInput" };
  }

  const result = await guarded(() =>
    moveStudySession(user.id, sessionId, start.toISOString(), end.toISOString()),
  );
  if (!result.ok) return result;

  revalidatePath("/planner");
  revalidatePath("/calendar");
  return actionOk();
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
