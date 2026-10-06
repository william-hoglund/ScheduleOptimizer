/**
 * Groups an `ImportCandidate.externalId` with the other occurrences of the
 * same recurring series, so the review screen can offer "apply this time to
 * the rest of them too" when one occurrence turns out to be misread rather
 * than making the student fix every row by hand.
 *
 * Two id shapes carry a series today, both built elsewhere and documented at
 * their source:
 * - `.ics` recurrence (`normalize-event.ts`'s `externalIdFor`): `${uid}::${startIso}`.
 * - A schedule-image weekly pattern (`schedule-image.ts`'s `toCandidate`):
 *   `schedule-image:${entryIndex}:${date}`.
 *
 * Returns null for anything else — a one-off event has no siblings to apply
 * a correction to.
 */
export function recurrenceGroupKey(externalId: string): string | null {
  const icsSplit = externalId.indexOf("::");
  if (icsSplit !== -1) return externalId.slice(0, icsSplit);

  if (externalId.startsWith("schedule-image:")) {
    const [prefix, entryIndex] = externalId.split(":");
    if (entryIndex !== undefined) return `${prefix}:${entryIndex}`;
  }

  return null;
}
