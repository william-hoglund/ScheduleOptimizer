/**
 * Onboarding steps.
 *
 * The number is stored in `profiles.onboarding_step` after each save, so
 * closing the tab halfway through resumes rather than restarts.
 *
 * The brief describes six steps. Two of them — connecting a calendar, and
 * generating a first plan — depend on machinery that does not exist yet
 * (Sessions 6 and 10). Rather than show steps whose buttons do nothing, they
 * are inserted when they work. Everything here is real today.
 */

export const ONBOARDING_STEPS = ["basics", "studies", "courses", "preferences", "done"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const FIRST_STEP = 1;
export const LAST_STEP = ONBOARDING_STEPS.length;

/** Stored step number (1-based) → step name. Clamped, so a bad value is survivable. */
export function stepFromNumber(value: number): OnboardingStep {
  const index = Math.min(Math.max(value, FIRST_STEP), LAST_STEP) - 1;
  return ONBOARDING_STEPS[index] ?? "basics";
}

export function numberFromStep(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step) + 1;
}
