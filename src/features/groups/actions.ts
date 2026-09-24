"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionOk, fromZodError, guarded, type ActionResult } from "@/lib/validation/action-result";
import { V } from "@/lib/validation/messages";
import { requireUserContext } from "@/server/auth";
import {
  createGroup,
  joinGroupByCode,
  leaveGroup,
  setMembershipStatus,
} from "@/server/study-group-service";

const createGroupSchema = z.object({
  name: z.string().trim().min(1, V.required).max(80, V.nameTooLong),
  weeklySessionGoal: z.coerce.number().int().min(1, V.outOfRange).max(500, V.outOfRange),
});

const joinSchema = z.object({
  // Trimmed and upper-cased before validation, so a pasted code with stray
  // spaces or lower case still works.
  joinCode: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{6,10}$/, V.outOfRange)),
});

export async function createStudyGroup(
  input: unknown,
): Promise<ActionResult<{ groupId: string; joinCode: string }>> {
  const { user } = await requireUserContext();

  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(() => createGroup(user.id, parsed.data));
  if (!result.ok) return result;

  revalidatePath("/insights");
  return actionOk(result.data);
}

export async function joinStudyGroup(input: unknown): Promise<ActionResult<{ found: boolean }>> {
  const { user } = await requireUserContext();

  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(() => joinGroupByCode(user.id, parsed.data.joinCode));
  if (!result.ok) return result;

  revalidatePath("/insights");
  // `found: false` rather than an error: a wrong code and a code for a group
  // that exists must be indistinguishable, or this becomes a way to probe.
  return actionOk({ found: result.data !== null });
}

export async function leaveStudyGroup(groupId: string): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => leaveGroup(user.id, groupId));
  if (!result.ok) return result;

  revalidatePath("/insights");
  return actionOk();
}

export async function setGroupPaused(
  groupId: string,
  paused: boolean,
): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() =>
    setMembershipStatus(user.id, groupId, paused ? "paused" : "active"),
  );
  if (!result.ok) return result;

  revalidatePath("/insights");
  return actionOk();
}
