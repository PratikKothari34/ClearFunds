/*
 * A COUNT THAT COULD NOT BE READ IS NOT A COUNT OF ZERO.
 *
 * The nav badge is the only way a committee member learns that something is
 * waiting for them. It was a `number | undefined` rendered by `if (!n) return
 * null`, so three different facts rendered identically as no badge at all:
 *
 *   - nothing is waiting                      (0)
 *   - the read has not come back yet          (undefined, pending)
 *   - the read FAILED                         (undefined, error)
 *
 * `useBadges` made the third one worse by writing `(proposals.data ?? [])
 * .filter(...).length`, which turns a failed read into a confident `0`. A
 * treasurer on a dropped connection saw a bare Approvals tab and had been
 * told, in the only language this surface speaks, that nothing needed them.
 *
 * This is the same bug as `null <= 0` in countable.ts and the same bug as
 * `?? []` drawing a failed read as an empty state: a fallback value that is
 * indistinguishable from a real answer. Hence three outcomes, never two, so
 * a surface can disclose that it does not know.
 *
 * Deliberately NOT given a count of its own: "unknown" has no number, and
 * inventing one (0, or the last value seen) is the bug.
 */

/** A badge count resolved into something the nav may render. */
export type BadgeCount =
  | { known: true; n: number }
  | { known: false }

export const UNKNOWN: BadgeCount = { known: false }

/*
 * A surface this person has no obligation on at all.
 *
 * Distinct from UNKNOWN, and the distinction is load-bearing in splitTabs:
 * `useBadges` only writes the keys that apply to the viewer's role, so an
 * ABSENT key means "no count applies here", which is known. Defaulting an
 * absent key to UNKNOWN would make every badgeless tab pressing and the
 * promotion would stop choosing anything.
 */
export const NO_COUNT: BadgeCount = { known: true, n: 0 }

/**
 * A count is known only when it is a non-negative safe integer.
 *
 * `undefined` covers both pending and failed, which the nav treats alike: in
 * both cases we do not know, and the honest rendering is the same. A negative
 * or fractional count is a bug upstream, and reporting it as unknown is
 * better than rendering "-1 waiting".
 */
export function badgeCount(n: unknown): BadgeCount {
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) return UNKNOWN
  return { known: true, n }
}

/*
 * There is deliberately no `badgeKind()` helper returning
 * 'none' | 'count' | 'unknown'. One was written and removed: the renderer has
 * to narrow on `known` anyway to reach `.n` without a cast, so a separate
 * kind function meant checking the kind and then asserting the field, and a
 * non-null assertion is exactly where trust leaks back in. The component
 * branches on the union directly.
 */

/*
 * Whether a tab must survive into the bottom bar rather than being demoted
 * into More.
 *
 * `unknown` counts as pressing. The alternative is to let a surface we could
 * not read sink one tap deeper, which is the same mistake as rendering no
 * badge: we do not know that nothing is waiting there, so we must not act as
 * though nothing is.
 */
export function pressing(c: BadgeCount): boolean {
  return !c.known || c.n > 0
}
