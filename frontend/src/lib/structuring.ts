/*
 * WHETHER TO WARN ABOUT EARLIER PAYMENTS TO A PAYEE - AND WHY THIS IS NOT A
 * COUNT.
 *
 * Structuring is below-limit payments to one payee that add up past the
 * committee's limit. `0004` settles that it is made VISIBLE rather than
 * blocked: blocking teaches splitting across payees, which is harder to see.
 * So the entry form warns the treasurer while they are typing, and the ledger
 * and the AGM report carry the aggregate.
 *
 * The warning used to be a count, computed here, and it was wrong in a way
 * nothing caught.
 *
 * The window is `structuring_window_days` calendar days ending on the later
 * payment, measured by THE SOCIETY'S date. A browser cannot evaluate that:
 * `Society` carries no timezone, so this device knows only its own clock.
 * The old rule was `Date.now() - N * 86_400_000`, sliced to a UTC date and
 * compared with `>=`, which is wrong twice over:
 *
 *   - `>= since` INCLUDES the boundary day, so N days back spans N+1 days;
 *   - the slice reads the UTC date, so a society in IST between midnight and
 *     05:30 local is a day behind.
 *
 * Together, 32 calendar days where the report counts 30. The hint said "3
 * payments" and the report said 1, for the same payee, on the one surface
 * whose purpose is that the treasurer sees what the report will say.
 *
 * A figure that disagrees with the report is worse than no figure here. It is
 * not a crash and not an obviously wrong number - it is a plausible count
 * that quietly contradicts the document it is preparing the reader for, the
 * same shape as a missing x100 on an amount.
 *
 * So this decides only WHETHER to warn, and the copy sends the reader to the
 * report for the number. The predicates kept are the ones that do not depend
 * on a clock, and they match the contract's rule: an expense, not reversed,
 * at the `pair` tier, payee compared ignoring case and surrounding spaces.
 *
 * ALL OF THIS GOES AWAY WHEN `api_structuring_hint` LANDS. The contract now
 * says the server is the only place the window is decided and a client
 * applies no predicate of its own. This module is the interim, and deleting
 * it in favour of the RPC is the intended end state, not a regression.
 */

/** The fields of a ledger row this decision reads. Nothing else is relevant. */
export type PayeeRow = {
  effect: string
  reversed_by_seq: number | null
  tier: string
  counterparty: string | null
}

/*
 * Compared the way the server compares: ignoring case AND surrounding spaces.
 * "Sharma Traders", "sharma traders" and " Sharma Traders " are one payee to
 * a resident, so an exact match would make capitalisation or a stray space a
 * split - which is the behaviour structuring disclosure exists to reveal.
 */
export const samePayee = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const x = (a ?? '').trim().toLowerCase()
  const y = (b ?? '').trim().toLowerCase()
  return x !== '' && x === y
}

/**
 * Whether to warn that earlier below-limit payments to this payee exist.
 *
 * Deliberately a boolean, not a count: see the header. A count would have to
 * come from the server, because only the server knows the society's date.
 */
export function hasEarlierToPayee(rows: readonly PayeeRow[] | undefined, payee: string): boolean {
  /*
   * A blank payee matches nothing: the field is still empty, so there is
   * nothing to warn about yet.
   *
   * THIS GUARD IS REDUNDANT AND KEPT ANYWAY. `samePayee`'s `x !== ''` already
   * refuses a blank on every row, so removing this line changes no verdict and
   * the mutant is unkillable by construction - not a gap in the suite. It
   * stays because it states the intent at the top of the function and skips a
   * scan of every row to reach the same answer. If `samePayee` is ever
   * loosened to match empty strings, this is what still refuses a blank field.
   */
  if (payee.trim() === '') return false
  return (rows ?? []).some(
    (r) =>
      r.effect === 'expense' &&
      /*
       * `reversed_by_seq === null` is the unreversed test, written against
       * null explicitly. A reversed payment is a corrected mistake, and
       * counting it would accumulate against the payee forever.
       */
      r.reversed_by_seq === null &&
      /*
       * `pair` only. An above-limit entry already went through N-of-M, so it
       * was never split - including it would warn about an entry that had
       * the fuller approval.
       */
      r.tier === 'pair' &&
      samePayee(r.counterparty, payee),
  )
}
