/**
 * Whether "now" falls inside a student's quiet hours — the one thing that
 * matters most for a periodic bulk job like notification dispatch, which is
 * where notification spam actually comes from (a direct response to one
 * user action carries far less of that risk).
 *
 * Pure: takes the already-resolved local time, does no timezone conversion
 * itself. Callers resolve "now" in the student's own zone first
 * (`utcToWallClock`), same discipline as everywhere else time-of-day matters.
 */
export function isWithinQuietHours({
  nowLocalTime,
  quietStart,
  quietEnd,
}: {
  /** "HH:MM" or "HH:MM:SS". */
  nowLocalTime: string;
  quietStart: string | null;
  quietEnd: string | null;
}): boolean {
  if (!quietStart || !quietEnd) return false;

  const now = nowLocalTime.slice(0, 5);
  const start = quietStart.slice(0, 5);
  const end = quietEnd.slice(0, 5);

  // An ordinary window (e.g. 13:00–14:00) doesn't cross midnight: inside
  // means between the two times. A window that crosses midnight (e.g.
  // 22:00–07:00) is inverted — "inside" is everything *outside* the
  // start-to-end range on the clock face.
  if (start <= end) return now >= start && now < end;
  return now >= start || now < end;
}
