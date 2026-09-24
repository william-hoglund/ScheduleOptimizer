import type { z } from "zod";

/**
 * What every server action returns.
 *
 * Errors are codes, not sentences, so the UI renders them in the student's
 * language. `fieldErrors` maps a form field name to a validation code, which
 * React Hook Form can apply directly to the right input.
 */
export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function actionOk(): ActionResult<undefined>;
export function actionOk<T>(data: T): ActionResult<T>;
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function actionFailed(error: string): ActionResult<never> {
  return { ok: false, error };
}

/** Turns a Zod failure into field-level codes the form can display in place. */
export function fromZodError(error: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path.join(".");
    if (field && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return { ok: false, error: "invalidInput", fieldErrors };
}

/**
 * Wraps a service call so an unexpected database error becomes a clean result
 * instead of an unhandled exception surfacing as a generic crash page.
 * The real message is logged server-side; the student sees a calm sentence.
 */
export async function guarded<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (cause) {
    console.error("[action]", cause);
    return { ok: false, error: "unexpected" };
  }
}
