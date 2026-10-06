/**
 * What pressing "Finish" on a started session records: the real minutes,
 * capped at the plan, and "partial" when short of it (so the rest can be
 * offered a new time). Always at least a minute — the student did start.
 */
export function finishOutcome(
  startedAtIso: string,
  nowIso: string,
  plannedMinutes: number,
): { status: "completed" | "partial"; minutes: number } {
  const elapsed = Math.max(1, Math.round((Date.parse(nowIso) - Date.parse(startedAtIso)) / 60_000));
  return {
    status: elapsed >= plannedMinutes ? "completed" : "partial",
    minutes: Math.min(elapsed, plannedMinutes),
  };
}
