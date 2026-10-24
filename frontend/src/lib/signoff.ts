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
export function isPeriodId(id: unknown): id is string {
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
  /*
   * COUNTED OVER THE SAME PERIODS `oldestUnsigned` WOULD OFFER.
   *
   * This was `periods.length - 1` over the raw list, which counts
   * months this module has already decided it cannot identify. A
   * malformed id is not a month waiting behind the one on screen - it
   * is a row we cannot place in the calendar, so it would inflate a
   * figure the president reads as "how far behind am I".
   */
  return Math.max(0, signable(periods).length - 1)
}

/**
 * The periods this module is willing to act on.
 *
 * One definition, because `oldestUnsigned` filtering while
 * `waitingBehind` did not is how the two disagreed. With all ids
 * malformed the first returned undefined and the second returned a
 * positive count, and the route reads them independently: it took the
 * undefined, rendered "Every month up to now has been signed off." -
 * the compliance claim its own comment calls the sharpest false
 * statement in the product - and threw the count away.
 */
export function signable(
  periods: readonly SignoffPeriod[],
): readonly SignoffPeriod[] {
  return periods.filter((p) => isPeriodId(p.id))
}

/**
 * Whether the list arrived usable at all.
 *
 * The distinction the route needs and could not make: EMPTY means
 * every month has been signed, UNUSABLE means months are listed and
 * none of them can be placed. Only the first earns the all-clear copy.
 *
 * A `null` read was already guarded. This is the case where the read
 * succeeded and the contents are the problem, which looks identical
 * from the route - both arrive as "no period to sign" - and resolves
 * to the opposite message.
 */
export function hasUnplaceablePeriods(
  periods: readonly SignoffPeriod[],
): boolean {
  return periods.length > 0 && signable(periods).length === 0
}
