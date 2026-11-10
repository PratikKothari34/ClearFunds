import { describe, expect, it } from 'vitest'
import { approvalsNeeded, seatedCount, tierBasis, TIER_FLOOR } from './tier'

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

/*
 * THE THIRD TERM.
 *
 * The server counts `greatest(ceil(2M/3), coalesce(committee_threshold, 0), 2)`
 * and this function carried the first and the last. Every case ABOVE this
 * block passes with the term missing, because they all call `approvalsNeeded`
 * with no threshold - which is the honest default and also exactly why the
 * gap survived: a fixture built from real data leaves the column NULL, both
 * sides compute the same number, and the suite is green over code that
 * understates the count for any society that raised it.
 *
 * So these cases set the threshold ABOVE `ceil(2M/3)` deliberately. A case
 * that sets it below proves nothing: `greatest` discards it and the answer is
 * the same whether the term is read or dropped.
 */
describe('approvalsNeeded: a committee that raised its threshold', () => {
  it('THE DEFECT: follows a threshold above two-thirds of M', () => {
    /*
     * M = 11 needs ceil(22/3) = 8. A committee that configured 9 must see 9;
     * the broken version said 8, and a member who counted eight signatures on
     * the card concluded the entry was waiting on the system.
     */
    expect(approvalsNeeded(11, 9), 'a configured 9 must beat the formula\'s 8').toBe(9)
  })

  it('matches the server term for term across committee sizes', () => {
    // The server's expression, written out, as the oracle - never a literal.
    const server = (m: number, t: number | null) =>
      Math.max(Math.ceil((2 * m) / 3), t ?? 0, TIER_FLOOR)
    for (let m = 1; m <= 25; m += 1) {
      for (const t of [null, 2, 3, 5, 8, 9, 13, 20, 25]) {
        expect(approvalsNeeded(m, t), `M=${m}, threshold=${t}`).toBe(server(m, t))
      }
    }
  })

  it('ignores a threshold that is lower than the rule, never lowering the count', () => {
    /*
     * `0006`: configurable HIGHER, never lower. A society that somehow holds a
     * threshold of 2 against M = 11 still needs 8 - the configured value may
     * only raise. This is the direction that would break the product's claim,
     * so it is asserted rather than left to `greatest`.
     */
    for (const low of [0, 1, 2, 3]) {
      expect(approvalsNeeded(11, low), `threshold ${low} must not lower M=11's 8`).toBe(8)
    }
  })

  it('treats an unreadable threshold as not raised, not as a reason to fail', () => {
    /*
     * The value crosses the wire, so it can be anything. Every unreadable form
     * contributes nothing and the answer falls back to the formula and the
     * floor - which can only UNDER-state, the same direction the code was
     * already wrong in, and never permits anything: the server decides.
     *
     * A NaN threshold is the one that matters. `Math.max(NaN, ...)` is NaN,
     * and a NaN count compares false against every approval total, so
     * "approvals >= needed" reads as satisfied and the screen calls an entry
     * ready to post.
     */
    for (const bad of [null, undefined, NaN, Infinity, -Infinity, '9', '', {}, [], true, -4]) {
      const n = approvalsNeeded(11, bad)
      expect(n, `threshold ${String(bad)} must fall back to the formula`).toBe(8)
      expect(Number.isFinite(n), `threshold ${String(bad)} must not yield NaN`).toBe(true)
    }
  })

  it('still holds the floor when the committee is empty and a threshold is set', () => {
    expect(approvalsNeeded(0, 5), 'an empty committee with a configured 5 must not drop to 2').toBe(5)
    expect(approvalsNeeded(0, null), 'an empty committee must still return the floor').toBe(TIER_FLOOR)
    expect(approvalsNeeded(NaN, 5), 'an unreadable M must not discard a configured threshold').toBe(5)
  })

  it('may exceed the seats, because a raised threshold is the committee\'s own choice', () => {
    /*
     * Deliberately contradicts the "never more than seats" invariant above,
     * which is asserted only for the UNRAISED case. A committee of 11 that
     * configured 13 has made its own entries unapprovable until it seats more
     * members, and the screen must say 13 rather than quietly clamp to 11.
     * Clamping would tell them the entry is reachable when it is not - and
     * the server does not clamp either, so a clamped screen would disagree
     * with the only authority there is.
     */
    expect(approvalsNeeded(11, 13)).toBe(13)
  })

  it('rounds a fractional threshold up, never down', () => {
    // A non-integer should not arrive, but rounding down would lower the count.
    expect(approvalsNeeded(11, 9.2)).toBe(10)
  })
})

/*
 * The caption under the figure. It was the string "Two-thirds, rounded up",
 * hardcoded in the route - true for every society that existed when it was
 * written, and false the moment one raised its threshold, directly beneath a
 * number that disproves it.
 *
 * These assert the RULE each answer names, not the wording. A copy edit
 * should not fail them; naming the wrong rule must.
 */
describe('tierBasis: the caption names the rule that produced the figure', () => {
  const two = /two-thirds/i
  const raised = /raised/i
  const floor = /never fewer/i

  it('THE DEFECT: does not call a raised threshold two-thirds', () => {
    // M = 11, configured 10. Two-thirds of 11 is 8, so "two-thirds" is a
    // claim the reader can check and find false.
    const need = approvalsNeeded(11, 10)
    expect(need).toBe(10)
    expect(tierBasis(need, 11)).not.toMatch(two)
    expect(tierBasis(need, 11)).toMatch(raised)
  })

  it('says two-thirds when two-thirds is what is binding', () => {
    for (const m of [4, 5, 7, 11, 13]) {
      const need = approvalsNeeded(m)
      expect(tierBasis(need, m), `M=${m}`).toMatch(two)
    }
  })

  it('names the floor when the floor is what is binding, not two-thirds', () => {
    /*
     * M = 2 needs ceil(4/3) = 2, which the floor also gives - so the floor is
     * NOT the reason and the caption should still say two-thirds. M = 1 needs
     * 1 by the formula and 2 by the floor, so there the floor is the reason.
     */
    expect(tierBasis(approvalsNeeded(1), 1)).toMatch(floor)
    expect(tierBasis(approvalsNeeded(2), 2)).toMatch(two)
  })

  it('does not claim a raise when the committee only matched the formula', () => {
    // A threshold equal to what two-thirds already demands changes nothing,
    // so calling it a raise would overstate what the committee did.
    const need = approvalsNeeded(11, 8)
    expect(need).toBe(8)
    expect(tierBasis(need, 11)).toMatch(two)
  })

  it('never claims a rule it cannot support when the figures are unreadable', () => {
    for (const bad of [NaN, Infinity]) {
      expect(tierBasis(bad, 11)).not.toMatch(two)
      expect(tierBasis(8, bad)).not.toMatch(two)
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
