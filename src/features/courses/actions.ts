"use server";

import { revalidatePath } from "next/cache";

import { courseSchema } from "@/lib/validation/academic";
import { actionOk, fromZodError, guarded, type ActionResult } from "@/lib/validation/action-result";
import { requireUser } from "@/server/auth";
import {
  createCourse,
  deleteCourse,
  setCourseArchived,
  updateCourse,
} from "@/server/course-service";

/** Course CRUD. Every action re-validates its input on the server. */

export async function saveCourse(
  input: unknown,
  courseId?: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(async () =>
    courseId
      ? await updateCourse(user.id, courseId, parsed.data)
      : await createCourse(user.id, parsed.data),
  );

  if (!result.ok) return result;

  revalidatePath("/courses");
  revalidatePath("/dashboard");
  return actionOk({ id: result.data.id });
}

export async function archiveCourse(
  courseId: string,
  archived: boolean,
): Promise<ActionResult<undefined>> {
  const user = await requireUser();

  const result = await guarded(() => setCourseArchived(user.id, courseId, archived));
  if (!result.ok) return result;

  revalidatePath("/courses");
  return actionOk();
}

export async function removeCourse(courseId: string): Promise<ActionResult<undefined>> {
  const user = await requireUser();

  const result = await guarded(() => deleteCourse(user.id, courseId));
  if (!result.ok) return result;

  revalidatePath("/courses");
  revalidatePath("/dashboard");
  return actionOk();
}
