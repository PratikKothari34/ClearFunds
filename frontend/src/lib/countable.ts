import type { Money } from './money'

/*
 * THE ONLY PLACE A RAW `.minor` IS READ TO MAKE A DECISION.
 *
 * HARD CONSTRAINT: no surface branches on a raw `.minor`. The reason is a
 * real bug this file exists to prevent:
 *
 *   `NaN > 0` is false.
 *
 * So a flat whose arrears figure could not be read took the SAME BRANCH as a
 * flat that had paid in full. The count of flats in arrears came out TOO LOW,
 * which told a treasurer to stop chasing people who still owed money. No
 * error, no warning, a plausible number.
 *
 * The fix is to partition THREE ways, never two. "Not positive" is not the
 * same statement as "zero or negative", and the difference is the whole bug.
 */

/*
 * `unreadable` is a first-class answer, not an error case. A surface that
 * receives it must DISCLOSE it - "3 of 150 flats could not be read" - rather
 * than folding it into either of the other two buckets.
 */
export type Countable =
  | { readonly kind: 'positive'; readonly amount: Money }
  | { readonly kind: 'zeroOrNegative'; readonly amount: Money }
  | { readonly kind: 'unreadable'; readonly reason: string }

export function classify(amount: Money | null | undefined): Countable {
  if (amount === null || amount === undefined) {
    return { kind: 'unreadable', reason: 'no amount was supplied' }
  }
  if (typeof amount.minor !== 'number' || !Number.isFinite(amount.minor)) {
    /*
     * Catches NaN and both Infinities. This is the branch the original bug
     * fell through: without it, NaN reached the comparison below and silently
     * answered "not positive".
     */
    return { kind: 'unreadable', reason: 'the amount is not a finite number' }
  }
  if (!Number.isInteger(amount.minor)) {
    // A fractional minor unit means the ×100 input boundary was crossed wrongly.
    return { kind: 'unreadable', reason: 'the amount is not a whole minor unit' }
  }
  if (typeof amount.currency !== 'string' || amount.currency.length !== 3) {
    return { kind: 'unreadable', reason: 'the currency is missing or malformed' }
  }

  return amount.minor > 0
    ? { kind: 'positive', amount }
    : { kind: 'zeroOrNegative', amount }
}

/*
 * A tally over a list, keeping the unreadable ones VISIBLE.
 *
 * `positive + zeroOrNegative` deliberately need not equal `total`. A caller
 * that wants a denominator must use `total`, and a caller that reports
 * "N flats in arrears" must also report `unreadable` when it is non-zero -
 * otherwise it is making a completeness claim it cannot support.
 *
 * This is a COUNT of entries, not a sum of money. No amounts are added.
 */
export interface Tally {
  readonly positive: number
  readonly zeroOrNegative: number
  readonly unreadable: number
  readonly total: number
}

export function tally(amounts: readonly (Money | null | undefined)[]): Tally {
  let positive = 0
  let zeroOrNegative = 0
  let unreadable = 0

  for (const a of amounts) {
    const c = classify(a)
    if (c.kind === 'positive') positive += 1
    else if (c.kind === 'zeroOrNegative') zeroOrNegative += 1
    else unreadable += 1
  }

  return {
    positive,
    zeroOrNegative,
    unreadable,
    total: amounts.length,
  }
}

/*
 * ---------------------------------------------------------------------------
 * COUNTS, WHICH ARE NOT AMOUNTS.
 *
 * `classify` above partitions a MONEY value. These three partition an integer
 * COUNT - how many open questions sit against an entry. They are kept separate
 * rather than folded into `classify` because a count has no currency and no
 * sign convention, and because the two have different safe directions on junk,
 * which is the distinction the rest of this section documents.
 * ---------------------------------------------------------------------------
 */
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
