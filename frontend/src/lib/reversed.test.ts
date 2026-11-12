import { describe, expect, it } from 'vitest'
import { monthHasReversal, OUT_LABEL, reversedIn, reversedOut, reversedPart } from './reversed'

/*
 * These test the function that DECIDES what a surface may say, not the
 * screens that report it. A render test would prove the words appear once
 * the answer is known; the answer is the guard.
 *
 * No assertion here is on a sample number for its own sake. Each states a
 * rule: that an unreadable pair cannot resolve to silence, that a
 * contradiction is refused rather than clamped, and that a disclosed figure
 * is the server's own reversed part rather than anything this lane computed.
 */

const month = (over: Partial<Record<'in_minor' | 'out_minor' | 'reversed_in_minor' | 'reversed_out_minor', unknown>> = {}) => ({
  in_minor: 0, out_minor: 0, reversed_in_minor: 0, reversed_out_minor: 0, ...over,
})

describe('reversedPart', () => {
  it('reports no reversal only when the side was READ and the part is zero', () => {
    const r = reversedPart(500, 0)
    expect(r.kind).toBe('none')
  })

  it('discloses the part the server reported, unchanged', () => {
    const side = 9_000
    const part = 2_500
    const r = reversedPart(side, part)
    expect(r).toEqual({ kind: 'some', minor: part })
  })

  it('never nets: the disclosed figure is the reversed part, not the side less it', () => {
    const side = 9_000
    const part = 9_000
    const r = reversedPart(side, part)
    /*
     * A wholly reversed month is the case a netting implementation would
     * collapse to zero and report as 'none' - telling the resident the
     * month was empty and concealing the reversal entirely.
     */
    expect(r).toEqual({ kind: 'some', minor: part })
    if (r.kind === 'some') expect(r.minor).not.toBe(side - part)
  })

  it('refuses a part LARGER than the side rather than clamping it', () => {
    const side = 9_000
    expect(reversedPart(side, side + 1).kind).toBe('unknown')
  })

  /*
   * A month whose every rupee in is a reversal is the live case on the
   * dashboard, not a contrived one: a society that posted one correction and
   * nothing else reads "In X, includes X of corrections". It sits on the
   * boundary the refusal above guards, so an off-by-one in that comparison -
   * `>=` where `>` belongs - would refuse the whole truthful month and report
   * the figure as unreadable. Disclosing all of it IS the disclosure working.
   */
  it('discloses a side that is ENTIRELY reversals, which is not an impossible figure', () => {
    const side = 23_100_00
    expect(reversedPart(side, side)).toEqual({ kind: 'some', minor: side })
  })

  it('refuses a negative part, which the server reports positive', () => {
    expect(reversedPart(9_000, -1).kind).toBe('unknown')
  })

  it('refuses a negative side, which the server reports positive', () => {
    expect(reversedPart(-1, 0).kind).toBe('unknown')
  })

  it.each([
    ['equal and both negative', -9_000, -9_000],
    ['part below a negative side', -5, -9_000],
    ['a negative part under a readable side', 9_000, -1],
  ])('refuses %s, which the bounds check alone would pass', (_what, side, part) => {
    /*
     * These are the pairs the `part > side` bound does NOT catch, because
     * part is not greater than side. Only the sign guard refuses them, and
     * without it each reads as a disclosable 'some' of a negative figure -
     * "minus Rs 90 of this is a correction".
     *
     * The two guards overlap elsewhere: `reversedPart(-1, 0)` above is caught
     * by either alone, since 0 > -1. That redundancy is kept rather than
     * deleted - each states a different fact about the server's contract, one
     * about sign and one about magnitude. These cases are what prove the sign
     * guard is load-bearing and not dead code riding on the bound.
     */
    expect(reversedPart(side, part).kind).toBe('unknown')
  })

  /*
   * Every one of these takes the `undefined > 0` branch under a naive
   * implementation - that is, it reads as "no reversals" and the disclosure
   * silently never renders. None may resolve to 'none'.
   */
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a float', 1.5],
    ['a numeric string', '2500'],
    ['past the safe integer range', Number.MAX_SAFE_INTEGER + 2],
  ])('cannot read %s as a reversed part, and does not fall back to silence', (_what, bad) => {
    const r = reversedPart(9_000, bad)
    expect(r.kind).toBe('unknown')
    expect(r.kind).not.toBe('none')
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['NaN', Number.NaN],
    ['a numeric string', '9000'],
  ])('cannot decide when the SIDE is %s, even with a readable part', (_what, bad) => {
    expect(reversedPart(bad, 0).kind).toBe('unknown')
  })
})

describe('reversedIn / reversedOut', () => {
  it('each reads its OWN side, so the two cannot be transposed', () => {
    const m = month({ in_minor: 9_000, reversed_in_minor: 2_500, out_minor: 400, reversed_out_minor: 100 })
    expect(reversedIn(m)).toEqual({ kind: 'some', minor: 2_500 })
    expect(reversedOut(m)).toEqual({ kind: 'some', minor: 100 })
  })

  it('bounds each side against its own total, not the other', () => {
    /*
     * The out side's part exceeds out but not in. Reading the wrong total -
     * the transposition a single-mutant test would miss - would accept it.
     */
    const m = month({ in_minor: 9_000, reversed_in_minor: 0, out_minor: 100, reversed_out_minor: 400 })
    expect(reversedOut(m).kind).toBe('unknown')
    expect(reversedIn(m).kind).toBe('none')
  })

  it('cannot decide about a month that is not there', () => {
    expect(reversedIn(undefined).kind).toBe('unknown')
    expect(reversedOut(undefined).kind).toBe('unknown')
  })
})

describe('monthHasReversal', () => {
  it('says none only when BOTH sides were read and both are zero', () => {
    expect(monthHasReversal(month())).toBe('none')
  })

  it('says some when either side carries one', () => {
    expect(monthHasReversal(month({ in_minor: 9_000, reversed_in_minor: 1 }))).toBe('some')
    expect(monthHasReversal(month({ out_minor: 9_000, reversed_out_minor: 1 }))).toBe('some')
  })

  it('lets unknown WIN over none, so an unreadable side is never reported as clean', () => {
    expect(monthHasReversal(month({ reversed_in_minor: undefined }))).toBe('unknown')
    expect(monthHasReversal(month({ reversed_out_minor: null }))).toBe('unknown')
  })

  it('lets unknown win over some as well, rather than disclosing a half-read month', () => {
    const m = month({ out_minor: 9_000, reversed_out_minor: 500, reversed_in_minor: Number.NaN })
    expect(monthHasReversal(m)).toBe('unknown')
  })

  it('cannot decide about a month that is not there', () => {
    expect(monthHasReversal(undefined)).toBe('unknown')
  })
})

describe('the out-side label', () => {
  it('does not claim the figure was spent', () => {
    /*
     * A reversed receipt is money out and was not spending, so "spent" is
     * false whenever a month holds one. Asserting the absence of the word is
     * the rule; asserting the replacement string would just restate it.
     */
    expect(OUT_LABEL.toLowerCase()).not.toContain('spent')
    expect(OUT_LABEL.toLowerCase()).not.toContain('spend')
  })
})
