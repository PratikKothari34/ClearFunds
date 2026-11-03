import { describe, expect, it } from 'vitest'
import { allocationBody, lineFor, split, type Allocation } from './allocation'
import { countable } from './countable'
import { format } from './money'
import { ShapeError, parse } from './parse'

/*
 * entry.$seq.tsx reached this body with `as unknown as {...}` and then did
 * arithmetic on it. There is NO error boundary in the tree, so each throw
 * blanked the entry-detail screen rather than one figure. These are the
 * bodies the server can actually send, including the empty one the contract
 * says is normal (`ledger.v1.md` item 16, "Empty otherwise").
 */

const body = (over: Record<string, unknown> = {}): unknown => ({
  flat_ids: ['f1', 'f2'], line_amounts: [500, 501], remainder_flats: ['f2'], flat_set: 'all', ...over,
})
const ok = (over: Record<string, unknown> = {}): Allocation =>
  parse(allocationBody, body(over), 'allocation')

describe('allocationBody', () => {
  it('parses a split the contract describes', () => {
    const a = ok()
    expect(a.flat_ids.length).toBe(a.line_amounts.length)
  })

  it('accepts the empty split, which is a normal non-charge entry', () => {
    // item 16: flat_ids is "Empty otherwise". Refusing this would make an
    // ordinary expense unviewable.
    expect(() => ok({ flat_ids: [], line_amounts: [], remainder_flats: [] })).not.toThrow()
  })

  it('accepts a null flat_set, and does not restrict its values', () => {
    // A fourth value is for the label to hedge over, not grounds to refuse
    // the whole split - that would hide every figure over a wording question.
    expect(ok({ flat_set: null }).flat_set).toBeNull()
    expect(ok({ flat_set: 'cf_a_value_added_later' }).flat_set).toBe('cf_a_value_added_later')
  })

  for (const field of ['flat_ids', 'line_amounts', 'remainder_flats']) {
    it(`refuses an absent ${field} instead of reading it as empty`, () => {
      // This is the TypeError path: body.flat_ids.length on undefined.
      // Absent is not empty - one is a broken entry, the other is normal.
      expect(() => ok({ [field]: undefined })).toThrow(ShapeError)
      expect(() => ok({ [field]: null })).toThrow(ShapeError)
    })
  }

  it('refuses an amount that is not an integer', () => {
    for (const bad of [[1.5], ['500'], [null], [Number.NaN]]) {
      expect(() => ok({ line_amounts: bad }), `accepted ${JSON.stringify(bad)}`).toThrow(ShapeError)
    }
  })
})

describe('split', () => {
  it('never produces a line money.ts would throw on', () => {
    // The guard that matters: every minor it emits must be formattable,
    // because <Amount> and format() are both downstream and only one of
    // them discloses.
    for (const over of [
      {},
      { line_amounts: [-500, -501], remainder_flats: ['f2'] },
      { flat_ids: ['f1'], line_amounts: [0], remainder_flats: [] },
    ]) {
      for (const l of split(ok(over)).lines) {
        expect(countable(l.minor).readable).toBe(true)
        expect(() => format(l.minor)).not.toThrow()
      }
    }
  })

  it('reports no base share for an empty split rather than Infinity', () => {
    // Math.min() of nothing is Infinity, and format() raises RangeError on
    // it. `null` is what lets the surface say "Not available".
    const s = split(ok({ flat_ids: [], line_amounts: [], remainder_flats: [] }))
    expect(s.lines).toHaveLength(0)
    expect(s.each).toBeNull()
    expect(countable(s.each).readable).toBe(false)
  })

  it('gives a base share that is formattable whenever there are lines', () => {
    const s = split(ok())
    expect(countable(s.each).readable).toBe(true)
    expect(() => format(s.each!)).not.toThrow()
  })

  it('is the share every flat pays, so no line is below it', () => {
    /*
     * The rule, not a number: the remainder flats pay ONE MINOR UNIT MORE
     * than the base (item 18), so the base is the smallest line by magnitude
     * and every line is at or above it. `Math.max` here would label the
     * remainder-inflated figure as what each flat pays - overstating the
     * charge on the screen where a resident checks their own.
     */
    for (const over of [{}, { line_amounts: [-500, -501] }, { flat_ids: ['f1'], line_amounts: [7] }]) {
      const s = split(ok(over))
      const base = Math.abs(s.each!)
      for (const l of s.lines) expect(Math.abs(l.minor)).toBeGreaterThanOrEqual(base)
      expect(s.lines.some((l) => Math.abs(l.minor) === base)).toBe(true)
    }
  })

  it('leaves the remainder flats exactly one unit above the base', () => {
    const s = split(ok({ flat_ids: ['f1', 'f2'], line_amounts: [500, 501], remainder_flats: ['f2'] }))
    for (const l of s.lines) {
      expect(Math.abs(l.minor) - Math.abs(s.each!)).toBe(l.remainder ? 1 : 0)
    }
  })

  it('takes the sign from the lines, so a negated reversal reads negative', () => {
    // item 17: a charge reversal stores the original's lines negated one by
    // one. The sign used to come from the entry total - a second source of
    // truth for the same fact.
    expect(split(ok({ line_amounts: [-500, -501] })).each!).toBeLessThan(0)
    expect(split(ok({ line_amounts: [500, 501] })).each!).toBeGreaterThan(0)
  })

  it('pairs by index and never reads past the shorter list', () => {
    // line_amounts[mine]! asserted non-null on a short list, and the
    // undefined reached parts().
    const s = split(ok({ flat_ids: ['f1', 'f2', 'f3'], line_amounts: [500] }))
    expect(s.lines).toHaveLength(1)
    for (const l of s.lines) expect(countable(l.minor).readable).toBe(true)
  })

  it('discloses a length mismatch instead of truncating in silence', () => {
    // A flat missing from one list is a flat whose charge nobody is shown.
    expect(split(ok({ flat_ids: ['f1', 'f2', 'f3'], line_amounts: [500] })).mismatch).toBe(true)
    expect(split(ok({ flat_ids: ['f1'], line_amounts: [500, 501] })).mismatch).toBe(true)
    expect(split(ok()).mismatch).toBe(false)
  })

  it('counts the remainder flats as the record states, not as pairs found', () => {
    // The count is the contract's own list (item 18), so a remainder flat
    // dropped from flat_ids still shows in the count.
    const s = split(ok({ remainder_flats: ['f2', 'f9'] }))
    expect(s.remainderCount).toBe(2)
  })

  it('marks exactly the flats the record says got the remainder', () => {
    const s = split(ok({ remainder_flats: ['f2'] }))
    expect(s.lines.filter((l) => l.remainder).map((l) => l.flat_id)).toEqual(['f2'])
  })
})

describe('lineFor', () => {
  it('finds a flat by id rather than by position', () => {
    const s = split(ok())
    expect(lineFor(s, 'f2')?.flat_id).toBe('f2')
  })

  it('returns null for a flat not in the split, and for no tenure', () => {
    const s = split(ok())
    for (const id of ['f9', null, undefined]) expect(lineFor(s, id)).toBeNull()
  })

  it('cannot be asked about an absent flat id, because none can be in the list', () => {
    /*
     * Both halves of this. `array(str)` refuses an absent id inside
     * flat_ids, so a line can never carry one; and lineFor rejects an absent
     * argument up front. Without the FIRST guard a resident with no open
     * tenure would match such a line and be shown someone else's charge as
     * "Your flat" - so the parser is what makes lineFor's null safe, and
     * this records that the two go together.
     */
    expect(() => ok({ flat_ids: ['f1', undefined], line_amounts: [500, 501] })).toThrow(ShapeError)
    expect(() => ok({ flat_ids: ['f1', null], line_amounts: [500, 501] })).toThrow(ShapeError)
    const s = split(ok())
    expect(lineFor(s, undefined)).toBeNull()
    expect(lineFor(s, null)).toBeNull()
  })

  it('never returns a line whose amount cannot be shown', () => {
    const s = split(ok({ flat_ids: ['f1', 'f2', 'f3'], line_amounts: [500] }))
    for (const id of ['f1', 'f2', 'f3']) {
      const l = lineFor(s, id)
      if (l) expect(countable(l.minor).readable).toBe(true)
    }
  })
})
