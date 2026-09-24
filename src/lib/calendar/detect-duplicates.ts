import type { ImportCandidate } from "./normalize-event";

/**
 * Deciding what an imported event already is.
 *
 * Importing the same timetable twice is the normal case, not the exception —
 * a student re-imports when the schedule changes. Without this, the second
 * import doubles every lecture, and the planner then schedules around obstacles
 * that exist twice.
 *
 * Pure, so every rule is testable, and nothing is decided behind the student's
 * back: the status is shown on the review screen and only sets which rows start
 * ticked.
 */

export type ExistingEvent = {
  id: string;
  externalEventId: string | null;
  title: string;
  startIso: string;
  /** Which imported calendar it belongs to. Null for manual events. */
  sourceId: string | null;
};

export type CandidateStatus =
  /** Nothing like it on the calendar. */
  | "new"
  /** Same feed identity — this exact event was imported before. */
  | "alreadyImported"
  /** Same title at the same time, from a different source (probably manual). */
  | "matchesExisting"
  /** The file itself lists it twice. */
  | "repeatedInFile";

export type ReviewCandidate = ImportCandidate & {
  status: CandidateStatus;
  /** The row this would update rather than insert, when there is one. */
  existingEventId: string | null;
};

/** Case, spacing and punctuation differences are not real differences here. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\-–—_.,;:]+/g, " ")
    .trim();
}

/** Minute precision: seconds never carry meaning on a timetable. */
function startKey(title: string, startIso: string): string {
  return `${normalizeTitle(title)}@${startIso.slice(0, 16)}`;
}

export function reviewImport(
  candidates: readonly ImportCandidate[],
  existing: readonly ExistingEvent[],
  /**
   * The calendar this import is going into. Feed identities are only unique
   * within one calendar — two universities happily issue the same UID — so a
   * match on external id only counts inside the same calendar.
   */
  targetSourceId: string | null = null,
): ReviewCandidate[] {
  const byExternalId = new Map<string, ExistingEvent>();
  const byTitleAndStart = new Map<string, ExistingEvent>();

  for (const event of existing) {
    if (event.externalEventId && event.sourceId === targetSourceId) {
      byExternalId.set(event.externalEventId, event);
    }
    byTitleAndStart.set(startKey(event.title, event.startIso), event);
  }

  const seenInFile = new Set<string>();

  return candidates.map((candidate) => {
    const key = startKey(candidate.title, candidate.startIso);

    const sameFeedEvent = byExternalId.get(candidate.externalId);
    if (sameFeedEvent) {
      seenInFile.add(key);
      return { ...candidate, status: "alreadyImported", existingEventId: sameFeedEvent.id };
    }

    if (seenInFile.has(key)) {
      return { ...candidate, status: "repeatedInFile", existingEventId: null };
    }
    seenInFile.add(key);

    const sameSlotEvent = byTitleAndStart.get(key);
    if (sameSlotEvent) {
      return { ...candidate, status: "matchesExisting", existingEventId: sameSlotEvent.id };
    }

    return { ...candidate, status: "new", existingEventId: null };
  });
}

/** Which rows the review screen ticks by default: the ones that add something. */
export function isSelectedByDefault(status: CandidateStatus): boolean {
  return status === "new";
}
