import { describe, expect, it } from 'vitest'
import { needsCommittee, type ReversalInputs } from './reversaltier'

/*
 * `0004`: a reversal needs AT LEAST the tier of the entry it reverses, and no
 * unreadable figure may ever buy the lower tier.
 *
 * These assert the RULE, never a sample total - an assertion on `=== 3` gets
 * "fixed" by editing the expected number, which deletes the test's meaning
 * while leaving it green.
 */

const base: ReversalInputs = {
  originalTier: 'pair',
  amountMinor: 50_000,
  limitMinor: 100_000,
  replacement: undefined,
}

const at = (o: Partial<ReversalInputs>) => needsCommittee({ ...base, ...o })

/** Every shape a server figure can arrive in that is not a usable number. */
const UNREADABLE = [null, undefined, NaN, Infinity, -Infinity, '5000', {}, [], true] as const

describe('which tier a reversal needs', () => {
  it('never drops below the tier the original was approved at', () => {
    /*
     * The whole point of `0004`. A reversal easier than its original makes
     * the tier a laundering path, so a committee-tier original can never be
     * reversed by the pair - at ANY amount, including one far below the
     * limit, and including a zero limit.
     */
    for (const amountMinor of [0, 1, 50_000, -50_000, Number.MAX_SAFE_INTEGER]) {
      for (const limitMinor of [0, 1, 100_000, Number.MAX_SAFE_INTEGER]) {
        expect(
          at({ originalTier: 'committee', amountMinor, limitMinor }),
          'a committee-tier entry reversed by two people is the laundering path 0004 closed',
        ).toBe(true)
      }
    }
  })

  it('forces the committee when the entry amount cannot be read', () => {
    /*
     * `Math.abs(null) > limit` is FALSE, so an unreadable amount would
     * otherwise take the pair branch silently - deciding who may move money
     * from a figure nobody could read.
     */
    for (const amountMinor of UNREADABLE) {
      expect(at({ amountMinor }), `an unreadable amount (${String(amountMinor)}) must not buy the pair tier`)
        .toBe(true)
    }
  })

  it('forces the committee when the limit in force cannot be read', () => {
    for (const limitMinor of UNREADABLE) {
      expect(at({ limitMinor }), `an unreadable limit (${String(limitMinor)}) must not buy the pair tier`)
        .toBe(true)
    }
  })

  it('forces the committee when a replacement amount would not parse', () => {
    /*
     * THE DEFECT THIS MODULE WAS EXTRACTED TO FIX. The route read
     * `(repl ?? 0) > limNow.minor`, collapsing "no replacement" and "a
     * replacement I could not read" into `0` - and `0 > limit` is false.
     *
     * `money.ts` `parse()` returns null for a malformed field AND for an
     * amount above MAX_SAFE_INTEGER, so the largest replacement a person can
     * type took the WEAKEST approval path.
     */
    expect(
      at({ replacement: null }),
      'an unparseable or overflowed replacement must not buy the pair tier',
    ).toBe(true)
  })

  it('distinguishes no replacement from an unreadable one', () => {
    // If these two ever agree, the bug above is back.
    expect(at({ replacement: undefined })).toBe(false)
    expect(at({ replacement: null })).toBe(true)
  })

  it('needs only the pair when everything is readable and at or below the limit', () => {
    // Without this the rule could be satisfied by always answering true.
    expect(at({ amountMinor: 100_000, limitMinor: 100_000 }), 'at the limit is still the pair tier')
      .toBe(false)
    expect(at({ amountMinor: 1, limitMinor: 100_000 })).toBe(false)
    expect(at({ amountMinor: 0, limitMinor: 0 }), 'a zero amount against a zero limit is at the limit')
      .toBe(false)
  })

  it('crosses to the committee strictly above the limit, not at it', () => {
    /*
     * "At or below it: treasurer and secretary, both. Above it: N-of-M."
     * Asserted as a boundary rather than a sampled number, so it survives any
     * limit the committee sets.
     */
    for (const limitMinor of [0, 1, 999, 100_000]) {
      expect(at({ amountMinor: limitMinor, limitMinor }), 'at the limit: pair').toBe(false)
      expect(at({ amountMinor: limitMinor + 1, limitMinor }), 'one minor unit above: committee')
        .toBe(true)
    }
  })

  it('judges a reversal by magnitude, so a credit cannot slip under the limit', () => {
    /*
     * Entries can be negative. Without `Math.abs`, `-500_000 > 100_000` is
     * false and a large credit reverses on two signatures - the laundering
     * path again, by sign instead of by tier.
     */
    for (const limitMinor of [0, 1, 100_000]) {
      const over = -(limitMinor + 1)
      expect(at({ amountMinor: over, limitMinor }), 'a credit past the limit still needs the committee')
        .toBe(true)
      expect(at({ replacement: over, limitMinor, amountMinor: 0 }), 'and so does a negative replacement')
        .toBe(true)
    }
  })

  it('treats a negative limit as no limit at all', () => {
    // `|minor| > -1` is true for every amount except via the abs of a smaller
    // negative, so a nonsense limit must not become a permissive one.
    expect(at({ limitMinor: -1, amountMinor: 0 }), 'a negative limit is not a limit')
      .toBe(true)
  })

  it('answers with a boolean for every combination, never undefined', () => {
    /*
     * The sheet has to STATE the approval it is asking for, so a third answer
     * is not available to it. A missing return would read as falsy - the pair
     * tier - which is the unsafe direction.
     */
    for (const originalTier of ['pair', 'committee'] as const) {
      for (const amountMinor of [...UNREADABLE, 0, 5, -5]) {
        for (const limitMinor of [...UNREADABLE, 0, 5]) {
          for (const replacement of [undefined, null, 0, 5, -5]) {
            expect(typeof at({ originalTier, amountMinor, limitMinor, replacement }))
              .toBe('boolean')
          }
        }
      }
    }
  })
})
