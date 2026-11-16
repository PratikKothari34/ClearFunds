/*
 * HOW MANY APPROVALS AN ABOVE-LIMIT ENTRY NEEDS - AND WHY THE FLOOR IS IN
 * CODE RATHER THAN IN SETTINGS.
 *
 * `0006` settles the rule: above the committee's rupee limit, at least
 * two-thirds of seated admins, rounded up - `ceil(2M/3)`, so 4 of 5 and 5 of
 * 7, never 3 of 5. Configurable HIGHER, never lower.
 *
 * The invariant underneath it is the product's whole claim: no single admin
 * moves the ledger alone. The tier trades 9-of-13 for 2-of-2, never for 1. So
 * the floor of 2 is not a rounding convenience - it is what stops a committee
 * of one or two seats, or a committee that has just lost members, from
 * producing a threshold of one and a ledger a single person can move.
 *
 * WHY THIS IS A MODULE. This arithmetic was written out twice, inline, in two
 * route files - `new.tsx` and `committee.tsx` - and tested in neither, because
 * a rule in a route cannot be reached without mounting a router, so it does
 * not get tested. Two copies of a hard floor agree until someone edits one;
 * the edit typechecks, and the entry form and the committee screen then
 * disagree about how many signatures the same entry needs. A member told the
 * entry needs one more approval than it does stops chasing the one it is
 * actually waiting on - the same failure the `selfApproves` comment in
 * `new.tsx` already describes.
 *
 * It is the floor that most needs the test. `Math.ceil((2 * m) / 3)` alone
 * returns 1 for m = 1 and 2 for m = 2 and 3, so the floor is invisible at
 * every committee size a test is likely to pick by hand - it only shows at
 * m = 1, and at m = 0 where the formula returns 0. Those are exactly the
 * states a committee passes through while being set up or after resignations.
 *
 * THIS IS A SECOND OPINION, NEVER THE AUTHORITY. The server decides whether
 * an entry has enough approvals, and `0004` puts the limit and M in force in
 * the chain so every approval is checkable against what applied THEN. This
 * module only tells a screen what to say. Where the two disagree the server
 * is right and the screen is stale - so nothing here may ever be used to
 * permit an action, only to describe one.
 */

/**
 * Seats that count toward M: those not yet vacated.
 *
 * Taken as `unknown[]` on purpose. The rows come from the server, so the
 * compiler cannot assert their shape - only a cast could, and a cast is where
 * trust leaks back in. A row whose `unseated_seq` is missing or the wrong type
 * is NOT counted as seated: an over-count raises the threshold, which is safe,
 * but it also means the screen reports a number the server will not agree
 * with, and the floor already protects the dangerous direction.
 */
export function seatedCount(seats: readonly unknown[] | undefined): number {
  let n = 0
  for (const s of seats ?? []) {
    if (typeof s !== 'object' || s === null) continue
    if (!('unseated_seq' in s)) continue
    if ((s as { unseated_seq: unknown }).unseated_seq === null) n += 1
  }
  return n
}

/**
 * The hard floor from `0006`. No committee size ever yields fewer.
 *
 * Configurable HIGHER, never lower - so `tier.test.ts` pins this to the
 * literal 2 rather than comparing against the constant. Every other test in
 * that file reads `TIER_FLOOR`, which keeps them correct if the floor rises;
 * but that made them circular about the floor itself, and lowering this to 1
 * once passed the entire suite. Found by mutation, not by review.
 */
export const TIER_FLOOR = 2

/**
 * Approvals needed above the limit: two-thirds of M rounded up, the society's
 * configured threshold if it raised one, never below `TIER_FLOOR`.
 *
 * THREE TERMS, because the server has three. `cf.required_committee` is
 * `greatest(ceil(2M/3), coalesce(committee_threshold, 0), 2)`, and this
 * function carried only the first and the last. The missing term is invisible
 * on every society that never raised its threshold - the column is nullable
 * and usually NULL, so both sides compute the same number and no fixture built
 * from real data disagrees. It separates the moment a committee uses the
 * column `0006` promised them: with M = 11 and a configured 9, the server
 * requires 9 and both screens said 8.
 *
 * Nothing is permitted by the wrong number - the server refuses the eighth
 * signature regardless. The cost is that a member reads "8 of 11", counts
 * eight signatures on the card, and concludes the entry is waiting on the
 * system rather than on a ninth person nobody is going to fetch.
 *
 * `threshold` is `unknown` on purpose, like `seatedCount`'s rows: it arrives
 * from the server, so the compiler cannot assert its shape and only a cast
 * could. A value that is not a finite number contributes NOTHING rather than
 * standing in as zero - zero is already the identity of this term, so an
 * unreadable threshold and an unset one produce the same answer, which is the
 * `ceil(2M/3)` floor. That is the safe direction: it can never lower the
 * count below what the formula and the floor already demand.
 *
 * A non-finite or negative M returns the floor rather than NaN or a negative
 * threshold. `Math.max(NaN, 2)` is NaN, and a NaN threshold renders as "NaN
 * approvals needed" or, worse, compares false against every count and reads as
 * satisfied - so it is refused here rather than carried forward. The same
 * applies to a NaN arriving through `threshold`.
 */
/**
 * Which rule produced the count a screen is showing.
 *
 * The committee screen captioned its figure "Two-thirds, rounded up", always.
 * That was true only while no society had raised its threshold - and once one
 * has, the caption sits directly under a number that contradicts it: 10 of 11
 * members, explained as two-thirds of 11, which is 8. A reader who can do the
 * arithmetic finds the screen wrong about its own figure, on the surface whose
 * job is to explain who may move money.
 *
 * It derives from the SAME `need` the figure renders, never from a second
 * computation, so the caption cannot drift from the number it captions. It
 * says nothing about the threshold's value: the point is which rule is
 * binding, not what the committee configured.
 */
export function tierBasis(need: number, m: number): string {
  if (!Number.isFinite(need) || !Number.isFinite(m)) return 'The committee rule.'
  // The floor is only *the* reason when it beats what the formula asked for.
  if (need > Math.max(Math.ceil((2 * m) / 3), TIER_FLOOR)) return 'Raised by the committee, above the usual share.'
  if (need === TIER_FLOOR && Math.ceil((2 * m) / 3) < TIER_FLOOR) return 'Never fewer than two, whatever the committee size.'
  return 'Two-thirds, rounded up.'
}

export function approvalsNeeded(m: number, threshold?: unknown): number {
  const raised = typeof threshold === 'number' && Number.isFinite(threshold) && threshold > 0
    ? Math.ceil(threshold)
    : 0
  if (!Number.isFinite(m) || m <= 0) return Math.max(raised, TIER_FLOOR)
  return Math.max(Math.ceil((2 * m) / 3), raised, TIER_FLOOR)
}
