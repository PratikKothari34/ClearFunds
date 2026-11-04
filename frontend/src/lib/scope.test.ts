import { describe, expect, it } from 'vitest'
import { scopeOf } from './scope'

/*
 * One row stands for one flat. Nothing here asserts a flat count, a label or
 * an amount: the rule is about how many rows arrived against how many the
 * society has, so a sample number in an assertion would be the thing
 * CLAUDE.md forbids - an expectation that gets "fixed" by editing the number.
 */
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ flat_id: `f${i}` }))

describe('scopeOf', () => {
  it('is full only when every flat in the society arrived', () => {
    for (const n of [1, 3, 150]) {
      expect(scopeOf(rows(n), n).kind, `${n} of ${n}`).toBe('full')
    }
  })

  it('is partial when fewer rows arrived than the society has flats', () => {
    /*
     * The defect this exists for. `flat_dues` is row-filtered to a resident's
     * own flats while `api_summary`'s totals stay society-wide, so a resident
     * would otherwise read "Flats owing 12 of 150" above a grid of one tile.
     */
    expect(scopeOf(rows(1), 150).kind).toBe('partial')
    expect(scopeOf(rows(149), 150).kind).toBe('partial')
  })

  it('is partial for no rows in a society that has flats', () => {
    /*
     * Nobody holds a tenure, or every row was filtered away. NOT full: zero
     * rows equalling a zero total is the only honest `full` with no rows, and
     * a 150-flat society sending none has plainly withheld them.
     */
    expect(scopeOf([], 150).kind).toBe('partial')
    expect(scopeOf([], 0).kind).toBe('full')
  })

  it('is unknown while the total has not loaded', () => {
    /*
     * With nothing to compare against, there is no scope to report. It must
     * not default to `full` - that is a claim - and must not default to
     * `partial`, which would flash a narrowing notice on every committee
     * load while api_summary was still in flight.
     */
    for (const t of [undefined, null]) {
      expect(scopeOf(rows(3), t).kind, String(t)).toBe('unknown')
    }
  })

  it('is unknown while the rows have not loaded', () => {
    // An absent query is not an empty society.
    expect(scopeOf(undefined, 150).kind).toBe('unknown')
    expect(scopeOf(undefined, undefined).kind).toBe('unknown')
  })

  it('distinguishes no rows yet from no rows at all', () => {
    /*
     * The pair that a `rows ?? []` would collapse. Both report got 0, and
     * they mean opposite things: one is still loading, the other is a
     * resident who was shown nothing.
     */
    expect(scopeOf(undefined, 150).kind).toBe('unknown')
    expect(scopeOf([], 150).kind).toBe('partial')
  })

  it('is unknown when a total is not a usable count', () => {
    /*
     * Not merely defensive. `got < NaN` is false and `got === NaN` is false,
     * so an unguarded comparison against a broken total would land on
     * whichever branch the code happened to write last - and reporting
     * `full` for a subset is a false statement about who can see what.
     */
    for (const t of [NaN, Infinity, -1, 1.5, -0.5]) {
      expect(scopeOf(rows(3), t).kind, String(t)).toBe('unknown')
    }
  })

  it('is unknown when more rows arrived than the society has flats', () => {
    /*
     * Neither claim is available: `full` would assert two disagreeing figures
     * agree, and `partial` would make a surface say "showing 151 of 150".
     */
    expect(scopeOf(rows(151), 150).kind).toBe('unknown')
  })

  it('reports the counts it compared, so a surface can state them', () => {
    const s = scopeOf(rows(2), 150)
    expect(s.got).toBe(2)
    expect(s.total).toBe(150)
  })

  it('reports no total when it had none to compare', () => {
    // A surface must never render "of null" or "of NaN".
    expect(scopeOf(rows(2), NaN).total).toBeNull()
    expect(scopeOf(rows(2), undefined).total).toBeNull()
  })

  it('never reports partial without a total to state', () => {
    /*
     * The invariant the notice depends on: it says "N flats of TOTAL", so
     * `partial` with a null total would render a broken sentence.
     */
    for (const t of [undefined, null, NaN, -1, 1.5, 150, 0, 3]) {
      for (const n of [0, 1, 3, 151]) {
        const s = scopeOf(rows(n), t)
        if (s.kind === 'partial') expect(typeof s.total, `${n} of ${t}`).toBe('number')
      }
    }
  })
})
