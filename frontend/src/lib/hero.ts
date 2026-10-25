/**
 * The hero's arithmetic and its phase vocabulary.
 *
 * SEPARATED FROM THE COMPONENT ON PURPOSE. These four exports are pure
 * and are what `Hero.test.ts` asserts against; leaving them beside the
 * component meant the one file exported both a component and a
 * function, which is the shape this project treats as a defect rather
 * than a lint annoyance — a rule that can be tested without mounting
 * anything belongs where it can be, and a file that exports both
 * invites the next pure helper to be written next to the JSX too.
 *
 * Nothing here reads the DOM, a timer or a fetch. The numbers are the
 * design, so they are stated once and imported.
 */

/** Below this, the hero is a flash. It does not render. */
export const HERO_FLOOR_MS = 400

/** Past this, the stroke holds at the cap and the copy changes. */
export const HERO_SLOW_MS = 4000

/**
 * The stroke never passes this while anything is outstanding. Reaching
 * 100% is reserved for actual completion.
 */
export const HERO_HOLD_PERCENT = 90

/**
 * The hero's phases. TWO DIFFERENT FAILURES, NAMED DIFFERENTLY.
 *
 * `anchor-unreachable` was called `failed`, and that name is what
 * caused the bug this union now prevents: `useBoot` also reports
 * `'failed'`, for the unrelated case of the boot fetch itself failing,
 * and the root route wired one into the other. The hero then told a
 * resident staring at a blank screen that the ledger had *loaded* and
 * only the published-record check was pending — three false statements
 * at once, announced through aria-live, with no error and no retry.
 *
 * A generic `failed` on a screen that can fail in two ways is an
 * invitation to map the wrong one onto it, so neither value is called
 * that. The copy for each says which thing failed.
 */
export type HeroPhase =
  | 'loading'
  | 'slow'
  /** The boot fetch failed: there is no ledger on screen. */
  | 'boot-failed'
  /** The ledger is in hand; only the published-record check did not resolve. */
  | 'anchor-unreachable'

/**
 * How far the stroke has travelled, given how long we have waited.
 *
 * Pure and exported so the holding behaviour is testable without a
 * timer: the test that matters is that no elapsed time produces 100.
 */
export function strokePercent(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  // Approaches the hold asymptotically rather than linearly, so the
  // motion slows as it goes and never appears stalled early.
  const progress = 1 - Math.exp(-elapsedMs / 1600)
  return Math.min(HERO_HOLD_PERCENT, progress * HERO_HOLD_PERCENT)
}
