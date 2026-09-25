import "server-only";

import { colorForCourse } from "@/lib/courses/course-color";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CourseRow } from "@/lib/supabase/types";
import type { CourseInput } from "@/lib/validation/academic";

/** Courses. The only place the `courses` table is read or written. */

/** Empty form fields arrive as "", but the column means "unset" — store null. */
function emptyToNull(value: string | null): string | null {
  return value === null || value.trim() === "" ? null : value;
}

function toRow(input: CourseInput) {
  return {
    name: input.name,
    code: emptyToNull(input.code),
    program_id: emptyToNull(input.programId),
    description: emptyToNull(input.description),
    // Assigned once from the name if the student has not picked one, so the
    // course looks the same in every view from the moment it is created.
    color: emptyToNull(input.color) ?? colorForCourse(input.name),
    difficulty: input.difficulty,
    priority: input.priority,
    target_grade: emptyToNull(input.targetGrade),
    estimated_weekly_hours: input.estimatedWeeklyHours,
    start_date: emptyToNull(input.startDate),
    end_date: emptyToNull(input.endDate),
  };
}

export async function listCourses(
  userId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<CourseRow[]> {
  const supabase = await createServerSupabaseClient();

  let query = supabase.from("courses").select("*").eq("user_id", userId);
  if (!includeArchived) query = query.eq("archived", false);

  const { data, error } = await query
    .order("priority", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw new Error(`Could not load courses: ${error.message}`);
  return data ?? [];
}

export async function getCourse(userId: string, courseId: string): Promise<CourseRow | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load course: ${error.message}`);
  return data;
}

export async function createCourse(userId: string, input: CourseInput): Promise<CourseRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("courses")
    .insert({ user_id: userId, ...toRow(input) })
    .select("*")
    .single();

  if (error) throw new Error(`Could not save course: ${error.message}`);
  return data;
}

export async function updateCourse(
  userId: string,
  courseId: string,
  input: CourseInput,
): Promise<CourseRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("courses")
    .update(toRow(input))
    .eq("id", courseId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(`Could not update course: ${error.message}`);
  return data;
}

/** Quick, single-field update — the advisor's "make this course higher priority" applies here. */
export async function setCoursePriority(
  userId: string,
  courseId: string,
  priority: number,
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("courses")
    .update({ priority })
    .eq("id", courseId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not update course priority: ${error.message}`);
}

/**
 * Archiving rather than deleting is the default action in the UI: a finished
 * course still owns tasks and completed study sessions that the student's
 * history depends on.
 */
export async function setCourseArchived(
  userId: string,
  courseId: string,
  archived: boolean,
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("courses")
    .update({ archived })
    .eq("id", courseId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not archive course: ${error.message}`);
}

/** Permanent. Cascades to the course's tasks. Offered only behind a confirmation. */
export async function deleteCourse(userId: string, courseId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("courses")
    .delete()
    .eq("id", courseId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not delete course: ${error.message}`);
}
