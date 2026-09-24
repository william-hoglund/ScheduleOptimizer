/**
 * Stable colour for a course.
 *
 * Derived from the course name so the same course always looks the same
 * everywhere — list, calendar, planner — without an extra query to find out
 * which colours are already taken.
 *
 * The palette is a fixed set of hues that all read clearly against both the
 * light and dark surfaces. Stored on the row so a rename does not silently
 * recolour a student's whole calendar.
 */

export const COURSE_PALETTE = [
  "#4F6FCB", // blue
  "#7A5BC7", // violet
  "#2E8B77", // teal-green
  "#C2733A", // amber-brown
  "#B4527E", // rose
  "#3E7FA8", // steel blue
  "#6B8E3A", // olive
  "#9A5BAF", // orchid
] as const;

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function colorForCourse(name: string): string {
  const index = hash(name.trim().toLowerCase()) % COURSE_PALETTE.length;
  return COURSE_PALETTE[index] ?? COURSE_PALETTE[0];
}
