import type { SignoffPeriod } from './types'

/**
 * Which month the president is asked to sign, and how many wait behind
 * it.
 *
 * This lives in lib rather than in the route because it is the rule,
 * not the rendering: sign-off is per-period and the OLDEST unsigned
 * period is the one that needs action. A route-local helper cannot be
 * tested without mounting a router, and this is exactly the logic that
 * must not be taken on trust — picking the wrong month puts a
 * president's name on the wrong sheet, with the right heading above it
 * and nothing on screen looking wrong.
 */

/**
 * The oldest unsigned period, chosen by id rather than array position.
 *
 * Ids are `s-YYYY-MM`, which sorts lexicographically in calendar
 * order. Reading `periods[0]` instead would silently depend on the
 * server sending them oldest-first — an assumption that is invisible
 * while it holds.
 */
export function oldestUnsigned(
  periods: readonly SignoffPeriod[],
): SignoffPeriod | undefined {
  return periods.reduce<SignoffPeriod | undefined>(
    (oldest, p) => (oldest === undefined || p.id < oldest.id ? p : oldest),
    undefined,
  )
}

/**
 * How many unsigned months sit behind the one on screen.
 *
 * Disclosed as a count, never listed as peers with their own buttons:
 * a list of months to sign invites signing the convenient one and
 * leaving a gap, and a gap in monthly sign-off is what the surface
 * exists to prevent.
 */
export function waitingBehind(periods: readonly SignoffPeriod[]): number {
  return Math.max(0, periods.length - 1)
}
