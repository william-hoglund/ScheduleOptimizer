import "server-only";

/**
 * The one place server code reads the clock.
 *
 * Two reasons it is a function in its own module rather than an inline
 * `new Date()`:
 *
 *  - Reading the clock during a component render is impure, and React's lint
 *    rules rightly flag it. Behind a named function the intent is explicit.
 *  - The planner must be reproducible. Every part of it takes `now` as an
 *    argument, and this is where the real value enters the system — so a test
 *    can pass a fixed instant instead.
 */
export function nowIso(): string {
  return new Date().toISOString();
}
