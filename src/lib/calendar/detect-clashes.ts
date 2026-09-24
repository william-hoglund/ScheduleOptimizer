/**
 * Two places to be at once.
 *
 * The moment a student combines two programmes — mechanical engineering and
 * economics, say — this stops being hypothetical. Neither university knows
 * about the other's timetable, so a Tuesday 10:15 lecture in one and a seminar
 * in the other is normal, not exceptional.
 *
 * The planner does not care: to it both are simply blocked time, and it plans
 * around both. That is right for study time and useless to the student, who has
 * to choose. So clashes are detected and shown; nothing is resolved
 * automatically, because which lecture to skip is not a decision code should be
 * making.
 *
 * Pure: events in, pairs out.
 */

export type ClashEvent = {
  id: string;
  title: string;
  startIso: string;
  endIso: string;
  /** Which imported calendar it belongs to, if any. */
  sourceId: string | null;
  isFixed: boolean;
  isAllDay: boolean;
};

export type Clash = {
  first: ClashEvent;
  second: ClashEvent;
  overlapMinutes: number;
  /** True when the two come from different calendars — the interesting case. */
  acrossCalendars: boolean;
};

/** Enough to show; beyond this the list stops being readable anyway. */
const MAX_CLASHES = 100;

function minutesBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000);
}

export function findClashes(events: readonly ClashEvent[]): Clash[] {
  const relevant = events
    // A movable event is not a commitment, and an all-day marker overlaps
    // everything on its day — reporting either would bury the real conflicts.
    .filter((event) => event.isFixed && !event.isAllDay && event.endIso > event.startIso)
    .sort((a, b) => a.startIso.localeCompare(b.startIso) || a.id.localeCompare(b.id));

  const clashes: Clash[] = [];
  // A sweep: only events that are still running can overlap the next one.
  const open: ClashEvent[] = [];

  for (const event of relevant) {
    for (let i = open.length - 1; i >= 0; i -= 1) {
      const other = open[i];
      if (!other) continue;

      if (other.endIso <= event.startIso) {
        open.splice(i, 1);
        continue;
      }

      if (clashes.length >= MAX_CLASHES) return clashes;

      const overlapEnd = other.endIso < event.endIso ? other.endIso : event.endIso;
      clashes.push({
        first: other,
        second: event,
        overlapMinutes: Math.max(0, minutesBetween(event.startIso, overlapEnd)),
        acrossCalendars: other.sourceId !== event.sourceId,
      });
    }

    open.push(event);
  }

  return clashes;
}

/** Ids of every event caught in at least one clash, for marking a list. */
export function clashingEventIds(clashes: readonly Clash[]): Set<string> {
  const ids = new Set<string>();
  for (const clash of clashes) {
    ids.add(clash.first.id);
    ids.add(clash.second.id);
  }
  return ids;
}
