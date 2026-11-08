import { describe, expect, it } from 'vitest'
import { approvalsNeeded, seatedCount, TIER_FLOOR } from './tier'

/*
 * These assert the RULE, not a table of answers. An assertion on `=== 4` gets
 * "fixed" by editing the expected number, which deletes the test's meaning
 * while leaving it green, so the two-thirds property is checked across a range
 * and the floor is checked as a floor.
 */

describe('approvalsNeeded: two-thirds of M, rounded up', () => {
  it('pins the floor to TWO as a literal, so the constant cannot be lowered', () => {
    /*
     * THE ONLY ASSERTION IN THIS FILE THAT MAY NOT READ TIER_FLOOR.
     *
     * Every other test compares against the constant, which is right for the
     * two-thirds property - it keeps them honest if the floor ever rises. But
     * it makes them CIRCULAR about the floor itself: lowering TIER_FLOOR to 1
     * moves the expectation with it and the whole suite stays green while a
     * single admin can move the ledger alone. Caught by mutation - the mutant
     * that matters most was the one survivor.
     *
     * 0006 fixes this number at two, in code, and permits configuring it
     * HIGHER but never lower. So the literal 2 is the rule, not a sample
     * number, and this is the one place the ban on asserting sample numbers
     * does not apply.
     */
    expect(TIER_FLOOR, '0006: the tier never reduces to one person').toBeGreaterThanOrEqual(2)
    expect(approvalsNeeded(1), 'a committee of one must not be able to approve alone')
      .toBeGreaterThanOrEqual(2)
    expect(approvalsNeeded(0), 'an empty committee must not yield a threshold of one or zero')
      .toBeGreaterThanOrEqual(2)
  })

  it('never returns fewer than two, at any committee size', () => {
    /*
     * The invariant `0006` exists to protect: the tier trades 9-of-13 for
     * 2-of-2, never for 1. A threshold of one is a ledger a single admin
     * moves alone, which is the one thing the product claims cannot happen.
     *
     * Checked at EVERY size including 0 and 1, because bare `ceil(2m/3)`
     * returns 1 at m=1 and 0 at m=0 and is correct everywhere else - so a
     * test that samples m=5 or m=7 by hand never sees the floor at all.
     */
    for (let m = 0; m <= 40; m += 1) {
      expect(approvalsNeeded(m), `M=${m} must never need fewer than two approvals`)
        .toBeGreaterThanOrEqual(TIER_FLOOR)
    }
  })

  it('is at least two-thirds of the committee, never a rounding down', () => {
    // 3 * needed >= 2 * m is `needed >= 2m/3` without floating point, so the
    // property is exact at every size rather than true within an epsilon.
    for (let m = 1; m <= 40; m += 1) {
      expect(3 * approvalsNeeded(m), `M=${m} must not round the two-thirds rule down`)
        .toBeGreaterThanOrEqual(2 * m)
    }
  })

  it('rounds UP rather than to the nearest, so an odd committee cannot sign at half plus one', () => {
    /*
     * The case `0006` calls out by name: 4 of 5, never 3 of 5. Stated as a
     * property - the result must exceed the exact two-thirds whenever 2M is
     * not divisible by 3 - so it holds for every size, not just five.
     */
    for (let m = 1; m <= 40; m += 1) {
      if ((2 * m) % 3 === 0) continue
      const exact = (2 * m) / 3
      if (approvalsNeeded(m) === TIER_FLOOR) continue // the floor is doing the work here
      expect(approvalsNeeded(m), `M=${m} must round the two-thirds rule up`)
        .toBeGreaterThan(exact)
    }
  })

  it('is the smallest count satisfying the rule, so the tier is not quietly stricter', () => {
    // A threshold higher than required is safe but wrong: it would tell a
    // committee it needs a signature the server will not ask for.
    for (let m = 1; m <= 40; m += 1) {
      const n = approvalsNeeded(m)
      if (n === TIER_FLOOR) continue
      expect(3 * (n - 1), `M=${m} needs ${n}, but ${n - 1} would already satisfy two-thirds`)
        .toBeLessThan(2 * m)
    }
  })

  it('never needs more approvals than there are seats to give them', () => {
    // Above the floor only: a committee of one genuinely cannot reach two,
    // and the honest answer is that it cannot approve anything, not that one
    // signature is enough.
    for (let m = TIER_FLOOR; m <= 40; m += 1) {
      expect(approvalsNeeded(m), `M=${m} must not need more approvals than seats`)
        .toBeLessThanOrEqual(m)
    }
  })

  it('rises with the committee, never falls as seats are added', () => {
    for (let m = 1; m <= 40; m += 1) {
      expect(approvalsNeeded(m + 1), `M=${m + 1} must not need fewer than M=${m}`)
        .toBeGreaterThanOrEqual(approvalsNeeded(m))
    }
  })

  it('returns the floor for a non-finite or negative M instead of NaN', () => {
    /*
     * `Math.max(NaN, 2)` is NaN, and a NaN threshold compares false against
     * every count - so "approvals >= needed" reads as satisfied and the screen
     * says an entry is ready to post. Refused here rather than carried.
     */
    for (const bad of [NaN, Infinity, -Infinity, -1, -40]) {
      expect(approvalsNeeded(bad), `M=${bad} must fall back to the floor`).toBe(TIER_FLOOR)
      expect(Number.isFinite(approvalsNeeded(bad))).toBe(true)
    }
  })
})

describe('seatedCount: M comes from the rows, not from the length', () => {
  it('counts only seats that have not been vacated', () => {
    const seats = [
      { unseated_seq: null },
      { unseated_seq: 12 },
      { unseated_seq: null },
      { unseated_seq: 0 },
    ]
    // Asserted against the predicate rather than a literal, so adding a row
    // to the fixture cannot silently change what the test means.
    expect(seatedCount(seats)).toBe(seats.filter((s) => s.unseated_seq === null).length)
  })

  it('treats seq 0 as vacated, because 0 is a real sequence number', () => {
    /*
     * The `zero is not absent` trap. A falsy test (`!s.unseated_seq`) counts a
     * seat vacated at sequence 0 as still seated, which raises M and so raises
     * the threshold - wrong in the safe direction, but it makes the screen
     * disagree with the server about who is on the committee.
     */
    expect(seatedCount([{ unseated_seq: 0 }])).toBe(0)
  })

  it('does not count a row whose seat field is missing or the wrong type', () => {
    // The rows come from the server, so only a cast could assert their shape.
    expect(seatedCount([{}, { unseated_seq: undefined }, null, 'seat', 7])).toBe(0)
  })

  it('is zero for absent data rather than throwing', () => {
    // A committee screen loading is not a committee of zero, but it must not
    // crash either: the floor keeps the threshold safe while it loads.
    expect(seatedCount(undefined)).toBe(0)
    expect(approvalsNeeded(seatedCount(undefined))).toBe(TIER_FLOOR)
  })
})
