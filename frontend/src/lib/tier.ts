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
 * Approvals needed above the limit: two-thirds of M rounded up, never below
 * `TIER_FLOOR`.
 *
 * A non-finite or negative M returns the floor rather than NaN or a negative
 * threshold. `Math.max(NaN, 2)` is NaN, and a NaN threshold renders as "NaN
 * approvals needed" or, worse, compares false against every count and reads as
 * satisfied - so it is refused here rather than carried forward.
 */
export function approvalsNeeded(m: number): number {
  if (!Number.isFinite(m) || m <= 0) return TIER_FLOOR
  return Math.max(Math.ceil((2 * m) / 3), TIER_FLOOR)
}
