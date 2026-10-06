/**
 * The study timer's rhythm, as a pure function of how long ago the session
 * started — so it survives reloads and tab switches with nothing stored but
 * `started_at` and the chosen style.
 *
 * Styles are the account's `breakMethod` values:
 *   none           "my own way" — no countdown, just elapsed time
 *   pomodoro       25 focus / 5 break, a 15-minute break after every 4th round
 *   fifty_ten      50 focus / 10 break
 *   ninety_twenty  deep work — one focus block for the whole session, with a
 *                  wrap-up notice 10 minutes before the end
 *   fifty_two      52 focus / 17 break
 *   sprint         one countdown of a length the student picks at Start
 *
 * The first four are also account-wide defaults (`breakMethod`); the last two
 * are chosen per session.
 */
export const STUDY_STYLES = ["none", "pomodoro", "fifty_ten", "ninety_twenty", "fifty_two", "sprint"] as const;
export type StudyStyle = (typeof STUDY_STYLES)[number];

export type TimerPhase = {
  kind: "free" | "focus" | "break" | "longBreak" | "wrapUp" | "overtime";
  /** 1-based focus round (Pomodoro styles); 1 otherwise. */
  round: number;
  /** Seconds until this phase ends; null when nothing is counting down. */
  secondsLeft: number | null;
};

const RHYTHM = {
  pomodoro: { focus: 25, rest: 5, longRest: 15, longEvery: 4 },
  fifty_ten: { focus: 50, rest: 10, longRest: 10, longEvery: Infinity },
  fifty_two: { focus: 52, rest: 17, longRest: 17, longEvery: Infinity },
} as const;

const WRAP_UP_MINUTES = 10;

export function timerPhase(
  style: StudyStyle,
  elapsedSeconds: number,
  plannedMinutes: number,
  sprintMinutes = 45,
): TimerPhase {
  const elapsed = Math.max(0, elapsedSeconds);

  if (style === "none") return { kind: "free", round: 1, secondsLeft: null };

  if (style === "sprint") {
    const left = sprintMinutes * 60 - elapsed;
    return left > 0 ? { kind: "focus", round: 1, secondsLeft: left } : { kind: "overtime", round: 1, secondsLeft: null };
  }

  if (style === "ninety_twenty") {
    const total = plannedMinutes * 60;
    const left = total - elapsed;
    if (left <= 0) return { kind: "overtime", round: 1, secondsLeft: null };
    if (left <= WRAP_UP_MINUTES * 60) return { kind: "wrapUp", round: 1, secondsLeft: left };
    return { kind: "focus", round: 1, secondsLeft: left - WRAP_UP_MINUTES * 60 };
  }

  const rhythm = RHYTHM[style];
  let t = elapsed;
  for (let round = 1; ; round += 1) {
    const focus = rhythm.focus * 60;
    if (t < focus) return { kind: "focus", round, secondsLeft: focus - t };
    t -= focus;
    const long = round % rhythm.longEvery === 0;
    const rest = (long ? rhythm.longRest : rhythm.rest) * 60;
    if (t < rest) return { kind: long ? "longBreak" : "break", round, secondsLeft: rest - t };
    t -= rest;
  }
}

/** The style a session starts in: the task's own method if it implies one, else the account's. */
export function defaultStyleFor(taskMethod: string | null | undefined, accountStyle: StudyStyle): StudyStyle {
  if (taskMethod === "pomodoro") return "pomodoro";
  if (taskMethod === "deep_work") return "ninety_twenty";
  return accountStyle;
}
