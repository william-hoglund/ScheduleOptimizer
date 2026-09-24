import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SessionStatus } from "@/lib/supabase/types";
import { listCourses } from "./course-service";

/**
 * Everything the exports draw from: approved study sessions and calendar
 * events in a date range, flattened into one shape.
 *
 * The three exports (`.ics`, PDF, PNG) all read this, so a session that appears
 * in one appears in all of them. Formatting — dates, times, translated labels —
 * belongs to the caller, because it depends on the student's locale.
 */

export type ExportItem = {
  id: string;
  kind: "session" | "event";
  title: string;
  startIso: string;
  endIso: string;
  courseName: string | null;
  location: string | null;
  /** Study sessions only: completed, missed, partial… */
  status: SessionStatus | null;
  description: string | null;
};

export type ExportSelection = {
  startIso: string;
  endIso: string;
  includeSessions: boolean;
  includeEvents: boolean;
};

export async function loadExportItems(
  userId: string,
  selection: ExportSelection,
): Promise<ExportItem[]> {
  const supabase = await createServerSupabaseClient();
  const courses = await listCourses(userId, { includeArchived: true });
  const courseNames = new Map(courses.map((course) => [course.id, course.name]));

  const items: ExportItem[] = [];

  if (selection.includeSessions) {
    const { data, error } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("user_id", userId)
      .lt("start_at", selection.endIso)
      .gt("end_at", selection.startIso)
      // A cancelled session is one the student removed. Exporting it would put
      // work back on a calendar they deliberately cleared.
      .neq("status", "cancelled")
      .order("start_at", { ascending: true });

    if (error) throw new Error(`Could not load sessions to export: ${error.message}`);

    for (const row of data ?? []) {
      items.push({
        id: row.id,
        kind: "session",
        title: row.title,
        startIso: row.start_at,
        endIso: row.end_at,
        courseName: row.course_id ? (courseNames.get(row.course_id) ?? null) : null,
        location: null,
        status: row.status,
        description: row.generation_reason,
      });
    }
  }

  if (selection.includeEvents) {
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", userId)
      .lt("start_at", selection.endIso)
      .gt("end_at", selection.startIso)
      .order("start_at", { ascending: true });

    if (error) throw new Error(`Could not load events to export: ${error.message}`);

    for (const row of data ?? []) {
      items.push({
        id: row.id,
        kind: "event",
        title: row.title,
        startIso: row.start_at,
        endIso: row.end_at,
        courseName: row.course_id ? (courseNames.get(row.course_id) ?? null) : null,
        location: row.location,
        status: null,
        description: row.description,
      });
    }
  }

  return items.sort((a, b) => a.startIso.localeCompare(b.startIso));
}
