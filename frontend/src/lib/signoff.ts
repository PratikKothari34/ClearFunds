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
  return periods.reduce<SignoffPeriod | undefined>((oldest, p) => {
    /*
     * The same value check as `newestEntry`, for the same reason.
     *
     * Lexicographic order is calendar order only for a well-formed
     * `s-YYYY-MM`. A period with a missing or malformed id compares
     * false in BOTH directions, so it is neither accepted nor
     * rejected — if it arrives first it is kept by the `undefined`
     * branch and nothing afterwards can displace it, and the president
     * is then shown the wrong month with the right heading above it.
     * That is the failure this module's header says it exists to
     * prevent, so the id is checked rather than assumed.
     */
    if (!isPeriodId(p.id)) return oldest
    if (oldest === undefined) return p
    return p.id < oldest.id ? p : oldest
  }, undefined)
}

/**
 * Whether an id is a period id that sorts in calendar order.
 *
 * Zero-padding is what makes the lexicographic comparison correct, so
 * the month must be two digits: `s-2026-4` would sort after
 * `s-2026-12`. The month range is checked too, because `s-2026-00`
 * would sort before every real month and take the sign-off surface with
 * it.
 */
function isPeriodId(id: unknown): id is string {
  if (typeof id !== 'string') return false
  const m = /^s-(\d{4})-(\d{2})$/.exec(id)
  if (!m) return false
  const month = Number(m[2])
  return month >= 1 && month <= 12
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
