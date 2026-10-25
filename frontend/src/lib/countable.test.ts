import { describe, expect, it } from 'vitest'
import { classify, tally } from './countable'
import type { Money } from './money'

const inr = (minor: number): Money => ({ minor, currency: 'INR' })

describe('the three-way partition', () => {
  /*
   * THE BUG THIS MODULE EXISTS FOR.
   *
   * `NaN > 0` is false, so a two-way partition put an UNREADABLE arrears
   * figure in the same bucket as a flat that had PAID. The count of flats in
   * arrears came out too low, and a treasurer stopped chasing real debt. No
   * error, no warning, a plausible number.
   *
   * The assertion is therefore not that NaN is unreadable in isolation - it
   * is that NaN lands somewhere DIFFERENT from a settled flat.
   */
  it('never puts an unreadable amount in the same bucket as a settled one', () => {
    const settled = classify(inr(0))
    const unreadable = classify(inr(Number.NaN))

    expect(settled.kind).toBe('zeroOrNegative')
    expect(
      unreadable.kind,
      'NaN > 0 is false, so a two-way partition silently counts an unreadable figure as settled. It must be its own answer.',
    ).not.toBe(settled.kind)
    expect(unreadable.kind).toBe('unreadable')
  })

  it('classifies every unreadable shape as unreadable', () => {
    const cases: { what: string; input: Money | null | undefined }[] = [
      { what: 'null', input: null },
      { what: 'undefined', input: undefined },
      { what: 'NaN', input: inr(Number.NaN) },
      { what: 'Infinity', input: inr(Number.POSITIVE_INFINITY) },
      { what: 'negative Infinity', input: inr(Number.NEGATIVE_INFINITY) },
      { what: 'a fractional minor unit', input: inr(0.5) },
      { what: 'a malformed currency', input: { minor: 1, currency: 'X' } },
    ]
    for (const { what, input } of cases) {
      expect(classify(input).kind, `${what} was not reported unreadable`).toBe(
        'unreadable',
      )
    }
  })

  it('gives every unreadable answer a non-empty reason a surface can disclose', () => {
    const c = classify(inr(Number.NaN))
    expect(c.kind).toBe('unreadable')
    if (c.kind === 'unreadable') {
      expect(c.reason.length).toBeGreaterThan(0)
    }
  })

  it('splits readable amounts on strictly greater than zero', () => {
    expect(classify(inr(1)).kind).toBe('positive')
    expect(classify(inr(0)).kind).toBe('zeroOrNegative')
    expect(classify(inr(-1)).kind).toBe('zeroOrNegative')
  })
})

describe('a tally keeps the unreadable ones visible', () => {
  it('does not fold unreadable entries into either readable bucket', () => {
    /*
     * Asserted as a relationship between the buckets, so adding or removing
     * a sample changes nothing about what is being proved.
     */
    const amounts = [inr(5), inr(0), inr(Number.NaN), null, inr(-3)]
    const t = tally(amounts)

    expect(t.total).toBe(amounts.length)
    expect(t.unreadable).toBeGreaterThan(0)
    expect(
      t.positive + t.zeroOrNegative,
      'the readable buckets must not account for the whole list when some entries could not be read - that is the completeness claim this module refuses to make',
    ).toBeLessThan(t.total)
    expect(t.positive + t.zeroOrNegative + t.unreadable).toBe(t.total)
  })

  it('reports zero unreadable only when every entry really was readable', () => {
    const t = tally([inr(1), inr(0), inr(-1)])
    expect(t.unreadable).toBe(0)
    expect(t.positive + t.zeroOrNegative).toBe(t.total)
  })

  it('counts an all-unreadable list as unreadable rather than as all settled', () => {
    const t = tally([null, undefined, inr(Number.NaN)])
    expect(t.unreadable).toBe(t.total)
    expect(t.positive).toBe(0)
    expect(t.zeroOrNegative).toBe(0)
  })

  it('handles an empty list without claiming anything', () => {
    const t = tally([])
    expect(t.total).toBe(0)
    expect(t.positive).toBe(0)
    expect(t.zeroOrNegative).toBe(0)
    expect(t.unreadable).toBe(0)
  })
})
