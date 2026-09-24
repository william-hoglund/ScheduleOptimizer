/**
 * Validation error codes.
 *
 * Schemas emit a code, not a sentence. The form translates it. This keeps one
 * schema usable by both the server (which must validate regardless of locale)
 * and the client (which shows the student's own language), without duplicating
 * every rule.
 *
 * Add a code here, then add it under `validation` in both message files —
 * `npm run check:messages` fails the build if either is missing.
 */
export const V = {
  required: "required",
  tooLong: "tooLong",
  nameTooLong: "nameTooLong",
  invalidNumber: "invalidNumber",
  outOfRange: "outOfRange",
  endBeforeStart: "endBeforeStart",
  sessionLengthsIncoherent: "sessionLengthsIncoherent",
  studyWindowTooShort: "studyWindowTooShort",
  dailyLessThanSession: "dailyLessThanSession",
  pickAtLeastOneDay: "pickAtLeastOneDay",
  invalidTimezone: "invalidTimezone",
} as const;

export type ValidationCode = (typeof V)[keyof typeof V];
