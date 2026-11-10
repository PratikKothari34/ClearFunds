/**
 * A TOTAL MAY NOT CONTRADICT THE ROWS PRINTED ABOVE IT.
 *
 * The spend card sliced the categories to four and then printed the server's
 * all-category total under them, labelled "Total". Both numbers were correct
 * and the card was false: on the seeded society the four rows sum to
 * Rs 11,39,222.88 and the line read Rs 12,46,422.88, the Rs 1,07,200
 * difference being three categories the card never mentioned.
 *
 * Tests `spendView`, the function that DECIDES - not the card that reports it.
 * A render test of the card would prove what the screen says once the answer
 * is known, and the answer is the bug.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { barPercent, spendView, type SpendItem } from './spend'

const item = (category: string, amount_minor: number): SpendItem => ({ category, amount_minor })

/** The shape the defect was found in: more categories than the card shows. */
const seven: SpendItem[] = [
  item('security', 47880000),
  item('housekeeping', 29750000),
  item('electricity', 29432288),
  item('lift', 6860000),
  item('repairs', 6590000),
  item('gardening', 4550000),
  item('admin', -420000),
]
const sevenTotal = seven.reduce((a, c) => a + c.amount_minor, 0)

describe('spendView', () => {
  it('THE DEFECT: a truncated list never claims to cover the whole figure', () => {
    const v = spendView(seven, sevenTotal, 4)
    expect(v.covers).toBe('partial')
    // The rule, not the arithmetic: whatever is shown must not add up to the
    // figure the card prints, and the view has to admit that.
    expect(v.shownTotal).not.toBe(v.allTotal)
    expect(v.hidden).toBe(seven.length - 4)
  })

  it('discloses the hidden rows rather than leaving a reader to subtract', () => {
    const v = spendView(seven, sevenTotal, 4)
    expect(v.hidden).toBeGreaterThan(0)
    // And the difference is attributable: shown + hidden accounts for the total.
    expect(v.allTotal - (v.shownTotal ?? 0)).toBe(
      seven.slice(4).reduce((a, c) => a + c.amount_minor, 0),
    )
  })

  it('says it covers everything exactly when the rows add up to the figure', () => {
    const three = seven.slice(0, 3)
    const v = spendView(three, three.reduce((a, c) => a + c.amount_minor, 0), 4)
    expect(v.covers).toBe('all')
    expect(v.hidden).toBe(0)
    expect(v.shownTotal).toBe(v.allTotal)
  })

  it('is PARTIAL whenever the sums disagree, even with every row shown', () => {
    /*
     * The honest case the `hidden === 0` shortcut would get wrong: the server's
     * total covers a window the category list does not, so nothing is
     * truncated and the figures still disagree. Asserting equality of sums
     * rather than absence of extra rows is what catches this.
     */
    const two = [item('a', 100), item('b', 200)]
    const v = spendView(two, 999, 4)
    expect(v.hidden).toBe(0)
    expect(v.covers).toBe('partial')
  })

  it('never scales a bar against a negative or zero amount', () => {
    // A negative leader scaled every bar by a negative number and inverted them.
    const negativeLeader = [item('admin', -420000), item('lift', 6860000)]
    const v = spendView(negativeLeader, -420000 + 6860000, 4)
    expect(v.scale).toBe(6860000)
    expect(v.scale!).toBeGreaterThan(0)
  })

  it('offers no scale at all when nothing shown is positive', () => {
    const v = spendView([item('admin', -420000), item('misc', 0)], -420000, 4)
    expect(v.scale).toBeNull()
  })

  it('refuses an amount it cannot trust rather than drawing something plausible', () => {
    // A wrong figure is worse than a crash: the boundary discloses the screen
    // as unreadable, and a silently wrong bar discloses nothing.
    expect(() => spendView([item('x', Number.NaN)], 0, 4)).toThrow(RangeError)
    expect(() => spendView([item('x', 1.5)], 0, 4)).toThrow(RangeError)
    expect(() => spendView([], Number.POSITIVE_INFINITY, 4)).toThrow(RangeError)
    expect(() => spendView([], 0, 0)).toThrow(RangeError)
  })

  it('handles an empty list without inventing a subtotal', () => {
    const v = spendView([], 0, 4)
    expect(v.shown).toEqual([])
    expect(v.shownTotal).toBeNull()
    expect(v.hidden).toBe(0)
  })

  it('keeps the server order, deciding nothing about rank', () => {
    const v = spendView(seven, sevenTotal, 4)
    expect(v.shown.map((c) => c.category)).toEqual(['security', 'housekeeping', 'electricity', 'lift'])
  })
})

describe('barPercent', () => {
  it('never returns a negative width, whatever the amount', () => {
    for (const n of [-1, -420000, -Number.MAX_SAFE_INTEGER]) {
      expect(barPercent(n, 1000)).toBeNull()
    }
  })

  it('draws no bar when there is no positive scale to measure against', () => {
    for (const scale of [null, 0, -5]) {
      expect(barPercent(1000, scale)).toBeNull()
    }
  })

  it('THROWS on an unreadable amount rather than treating it as negative', () => {
    /*
     * This is the entry `minor.sweep.test.ts` allowlists `lib/spend.ts` for,
     * so the claim has to be tested or the allowlist is just a comment.
     * `null <= 0` is TRUE, so without the refusal an unsupplied figure gets
     * the same silent "no bar" as a genuine negative while the amount beside
     * it throws - a row that looks deliberately bar-less instead of broken.
     */
    for (const bad of [null, undefined, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
      expect(() => barPercent(bad as unknown as number, 1000)).toThrow(RangeError)
    }
  })

  it('never exceeds the full width', () => {
    expect(barPercent(2000, 1000)).toBe(100)
    expect(barPercent(1000, 1000)).toBe(100)
  })

  it('is proportional in between, so bars compare honestly', () => {
    expect(barPercent(500, 1000)).toBe(50)
    expect(barPercent(250, 1000)).toBe(25)
  })
})

/*
 * THAT THE CARD USES IT, which the cases above cannot reach.
 *
 * Everything above passes on the broken card: the defect was the route
 * slicing and labelling the figure itself, never calling into `lib/`. An
 * unused decision function is indistinguishable from no fix while looking
 * fully tested. Comments stripped first, because this file's prose and the
 * route's prose both name these identifiers - the trap `csp.test.ts` and
 * `components/boundary.wiring.test.ts` both document.
 */
describe('the home spend card is wired to it', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'routes', 'index.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('asks spendView what to show', () => {
    expect(src).toMatch(/spendView\(items,\s*total,/)
  })

  it('takes bar widths from barPercent', () => {
    expect(src).toMatch(/barPercent\(c\.amount_minor,\s*v\.scale\)/)
  })

  it('does NOT slice the categories itself', () => {
    // The exact shape of the defect. If this returns, the route is deciding
    // what to show again and the label is free to contradict it.
    expect(src).not.toMatch(/items\.slice\(/)
  })

  it('does NOT scale a bar against the first row on trust', () => {
    /*
     * `top[0]!.amount_minor || 1` inverted every bar on a negative leader.
     * Matched on indexing the leader, not on `|| 1` alone: line 109's month
     * bar legitimately guards a divide that way, and a blanket ban on the
     * idiom would fail on correct unrelated code - the false-denial shape.
     */
    expect(src).not.toMatch(/top\[0\]/)
    expect(src).not.toMatch(/items\[0\]/)
    expect(src).not.toMatch(/amount_minor \|\|/)
  })

  it('prints a bare Total only on the branch that proved it covers everything', () => {
    /*
     * The decision is `covers`, so the unqualified word has to sit behind it.
     * A card that prints "Total" unconditionally is the original bug however
     * correct the arithmetic behind the figure is.
     */
    expect(src).toMatch(/v\.covers === 'all'/)
    expect(src).toMatch(/all \$\{v\.shown\.length \+ v\.hidden\} categories/)
  })
})
