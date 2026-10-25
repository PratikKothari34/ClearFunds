/**
 * Whether a figure is one we are entitled to show.
 *
 * EVERY COMPARISON AGAINST NaN IS FALSE, which is why this exists as a
 * predicate rather than being written out at each site. `count > 0` is
 * the obvious spelling and it is wrong: a NaN count sails through it,
 * so the surface renders "NaN questions have been asked about this
 * entry" and a screen reader says "NaN". `?? 0` does not help either —
 * NaN is neither null nor undefined, so the default never fires.
 *
 * NaN is not hypothetical here. It is what arrives from a figure the
 * server sent as a string, a subtraction against a missing field, or a
 * JSON null coerced with `+`. None of those throw; they produce a
 * number that fails every test asked of it.
 *
 * An integer is required too: 2.5 questions have been asked about
 * nothing, and a fractional count means the figure was computed from
 * something it should not have been.
 *
 * REFUSING TO SHOW IS THE SAFE DIRECTION, and it is the opposite of
 * `flags.ts`'s rule on purpose. There, an unusable value counts as
 * unresolved, because a hidden open question is the failure that
 * matters. Here the unusable value is the count ITSELF, so there is no
 * honest figure to fall back to: saying nothing means "nothing is known
 * to be waiting", while rendering the junk states a quantity that is
 * not true.
 *
 * `NavBadge` had this guard and the other four surfaces did not, each
 * carrying its own spelling — `> 0`, `?? 0`, a bare interpolation. One
 * NaN in a per-route map also made the whole aggregated More badge
 * vanish, because `NaN + n` is NaN for the rest of the reduction.
 */
export function isShowableCount(count: unknown): count is number {
  return Number.isInteger(count) && (count as number) > 0
}

/**
 * A count safe to add up, with anything unusable treated as nothing.
 *
 * For the aggregate case only: the More badge sums the counts of the
 * items it hides, and one bad figure must not take the others with it.
 * Dropping the junk term under-reports that one item, which is the
 * right trade against the alternative — losing every other item's
 * count and showing no badge at all.
 *
 * Not for displaying a single figure. There, `isShowableCount` refuses
 * outright, because zero-for-unusable on one surface is a claim that
 * nothing is waiting.
 */
export function addableCount(count: unknown): number {
  return Number.isInteger(count) && (count as number) > 0
    ? (count as number)
    : 0
}

/**
 * Whether a count is unusable - absent, NaN, negative, fractional.
 *
 * NOT `!isShowableCount(c)`: that is also true of a legitimate zero,
 * and zero is the answer "nothing outstanding", which is a fact rather
 * than a gap. This is for the surfaces where an unreadable figure has
 * to fail in the OPPOSITE direction from a display: the sign-off page
 * decides whether to warn the president that questions are
 * outstanding, and `NaN > 0` being false told them the month was
 * clean while hiding the band that would have said otherwise.
 *
 * So a display asks `isShowableCount` and stays silent on junk; a
 * decision asks this and speaks up.
 */
export function isUnreadableCount(count: unknown): boolean {
  return !Number.isInteger(count) || (count as number) < 0
}

/**
 * Whether an amount is unusable - absent, NaN, fractional, negative.
 *
 * THE SAME DISCIPLINE AS `isUnreadableCount`, APPLIED TO MONEY, which
 * had none. Every money comparison in the product was a bare
 * `amount.minor > 0`, and `NaN > 0` is false, so a flat whose
 * outstanding figure arrived unreadable dropped out of the arrears
 * list and the dues page then stated "4 of 96 flats have something
 * outstanding" - a count that is too LOW. Under-reporting arrears
 * tells a treasurer to stop chasing a debt that may exist, which is
 * the direction this product must never fail in.
 *
 * A fractional `minor` is unusable too, not merely odd: minor units
 * are an integer count by decision `0002`, so 1250.5 paise means the
 * figure was computed by something that divided when it should not
 * have - the exact arithmetic the frontend is forbidden to do.
 *
 * Negative is unusable rather than "money owed the other way": this
 * product's outstanding figures are magnitudes, and direction is a
 * separate field. A negative arrears figure is a wire error.
 *
 * ZERO IS NOT UNREADABLE. Zero outstanding is the answer "this flat
 * has paid", which is a fact and the commonest one. That is why this
 * is not `!isPayable(...)`.
 */
export function isUnreadableAmount(amount: unknown): boolean {
  if (typeof amount !== 'object' || amount === null) return true
  const minor = (amount as { minor?: unknown }).minor
  return !Number.isInteger(minor) || (minor as number) < 0
}

/**
 * Whether an amount is a figure we can state as outstanding.
 *
 * The display-side counterpart: strictly positive AND readable. A
 * surface that colours a row amber, or counts it as owing, asks this;
 * a surface deciding whether to warn asks `isUnreadableAmount` and
 * speaks up. Both are needed, because the two questions have
 * different right answers for junk - silence for a display, a warning
 * for a decision.
 */
export function isOutstanding(amount: unknown): boolean {
  if (isUnreadableAmount(amount)) return false
  return ((amount as { minor: number }).minor) > 0
}
