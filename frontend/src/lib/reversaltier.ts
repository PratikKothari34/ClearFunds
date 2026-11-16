import { countable } from './countable'

/*
 * WHICH TIER A REVERSAL NEEDS - `0004`.
 *
 * "A reversal needs at least the tier of the entry it reverses." A reversal
 * that is EASIER to approve than its original makes the tier a laundering
 * path: post at committee tier, reverse with two signatures, and the ledger
 * has moved on an approval the original amount was never allowed.
 *
 * WHY THIS IS A MODULE. It was eight lines inside the reversal sheet in
 * `routes/entry.$seq.tsx`, which means reaching it required mounting a
 * router, which means it was never tested - the same hole `lib/tier.ts` was
 * extracted to close, and the same hole that let the sign-off oldest-month
 * bug survive. A rule that decides who may move money does not live in a
 * route file.
 *
 * EVERY UNREADABLE INPUT FORCES THE HIGHER TIER. The original logic got this
 * right for the entry amount and the limit, and said so: `Math.abs(null) >
 * lim` is false, so a figure nobody could read would otherwise have chosen
 * the LOWER tier silently. It got it wrong for one operand - see
 * `replacement` below.
 */

/** What the reversal sheet knows when it has to decide the tier. */
export type ReversalInputs = {
  /** The tier the entry being reversed was approved at. */
  originalTier: 'pair' | 'committee'
  /** The entry's own amount, straight off the server - may be unreadable. */
  amountMinor: unknown
  /** The limit in force now, straight off the server - may be unreadable. */
  limitMinor: unknown
  /**
   * The replacement amount, when the admin is correcting rather than plainly
   * reversing: the parsed minor units, `null` if the field would not parse,
   * or `undefined` when there is no replacement at all.
   *
   * THE DISTINCTION IS THE BUG. The route read `(repl ?? 0) > limNow.minor`,
   * which collapses "no replacement" and "a replacement I could not read"
   * into the same `0` - and `0 > limit` is false, so an unparseable
   * replacement chose the PAIR tier. `money.ts`'s `parse()` returns `null`
   * both for a malformed field and for an amount above MAX_SAFE_INTEGER, so
   * the largest replacement a person can type took the weakest approval
   * path. One operand to the right of a comment explaining this very trap.
   */
  replacement: number | null | undefined
}

/**
 * True when this reversal needs the committee rather than the pair.
 *
 * Returns the HIGHER tier whenever anything it needs is unreadable. There is
 * no third answer on purpose: the sheet must be able to state what approval
 * it is asking for, and "unknown" is not something a treasurer can act on.
 * Erring high costs a committee vote that may not have been needed; erring
 * low moves the ledger on an approval it never had.
 */
export function needsCommittee(i: ReversalInputs): boolean {
  if (i.originalTier === 'committee') return true

  const limit = countable(i.limitMinor)
  const amount = countable(i.amountMinor)
  if (!limit.readable || !amount.readable) return true

  // A negative limit is not a limit. Nothing is at or below it.
  if (limit.minor < 0) return true

  if (Math.abs(amount.minor) > limit.minor) return true

  // `undefined` means a plain reversal with no replacement - nothing to test.
  if (i.replacement === undefined) return false
  // `null` means the field would not parse, or overflowed. Never the pair.
  if (i.replacement === null) return true

  return Math.abs(i.replacement) > limit.minor
}
