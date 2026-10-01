"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { courseSchema } from "@/lib/validation/academic";
import { actionOk, fromZodError, guarded, type ActionResult } from "@/lib/validation/action-result";
import { requireUser } from "@/server/auth";
import {
  createCourse,
  deleteCourse,
  listCourses,
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

/** Course codes are written inconsistently ("tddd86", "TDDD-86"); this is not. */
function codeKey(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const courseCodesSchema = z.array(z.string().trim().min(1).max(20)).min(1).max(20);

/**
 * Turning course codes spotted during a calendar import into real courses.
 *
 * A code the import found that matches nothing in the student's course list
 * shows as "{code} — no course yet" on the review screen (see
 * `import-review-list.tsx`) — this is what that badge's action calls. No
 * description, no difficulty guess: there is nothing in a calendar event to
 * honestly infer either from, so the course is created with just its code as
 * its name, exactly as typed on the import feed, ready for the student to
 * fill in from the Course Overview page afterward.
 */
export async function createCoursesFromCodes(
  input: unknown,
): Promise<ActionResult<{ code: string; id: string; name: string }[]>> {
  const user = await requireUser();

  const parsed = courseCodesSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(async () => {
    const existing = await listCourses(user.id, { includeArchived: true });
    const existingKeys = new Set(
      existing.filter((course) => course.code).map((course) => codeKey(course.code!)),
    );

    // Two different codes in the same request could still collide once
    // normalised (e.g. "tddd86" and "TDDD-86") — create each distinct key once.
    const seen = new Set<string>();
    const toCreate = parsed.data.filter((code) => {
      const key = codeKey(code);
      if (existingKeys.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const created: { code: string; id: string; name: string }[] = [];
    for (const code of toCreate) {
      const course = await createCourse(user.id, {
        name: code,
        code,
        programId: null,
        description: null,
        color: null,
        difficulty: 3,
        priority: 3,
        targetGrade: null,
        estimatedWeeklyHours: null,
        startDate: null,
        endDate: null,
      });
      created.push({ code, id: course.id, name: course.name });
    }
    return created;
  });
  if (!result.ok) return result;

  revalidatePath("/courses");
  revalidatePath("/dashboard");
  return result;
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
