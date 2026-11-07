import { describe, expect, it } from 'vitest'
import { isDue, isMonth, signoffMonths } from './signoff'
import { recentMonths } from './pending'

/*
 * These tests exist because the month set was decided at a call site in a
 * route, where nothing could test it. `recentMonths` had five green tests and
 * all of them were about generating twelve months correctly; none could ask
 * whether twelve was the right set. The assertions below are about the SET,
 * which is the decision the screen depends on.
 */

const floor = (cur: string) => recentMonths(cur, 12)

describe('signoffMonths', () => {
  it('keeps an unsigned month older than the rolling window', () => {
    /*
     * THE BUG, stated as a test. A rolling twelve months from today drops an
     * older unsigned month entirely - not shown as overdue, not shown at all.
     * The president of a society that went quiet for a year was told there was
     * nothing to sign. The month set must contain it because the DATA says it
     * exists, whatever today's date is.
     */
    const cur = '2026-11'
    const old = '2024-03'
    expect(floor(cur), 'the old window must not already contain it, or this proves nothing')
      .not.toContain(old)
    expect(signoffMonths([old], [], floor(cur))).toContain(old)
    /* Signed or unsigned, it is still part of the record. */
    expect(signoffMonths([], [old], floor(cur))).toContain(old)
  })

  it('can only add to the floor, never remove a month from it', () => {
    /* The property the old code lacked. Whatever the data says, every month
     * the floor offers is still offered - so a summary that fails to load
     * cannot empty the screen. Asserted as a superset rather than on a count,
     * which would be an assertion on a sample number. */
    const cur = '2026-07'
    const f = floor(cur)
    for (const activity of [[], ['2026-07'], ['2020-01', '2031-12'], undefined]) {
      const out = signoffMonths(activity, undefined, f)
      for (const m of f) expect(out, `floor month ${m} dropped`).toContain(m)
    }
  })

  it('is newest first, strictly descending, with no repeats', () => {
    const out = signoffMonths(['2026-01', '2026-03', '2026-01'], ['2026-03', '2025-12'], floor('2026-04'))
    for (let i = 1; i < out.length; i++) {
      expect(out[i]! < out[i - 1]!, `${out[i]} came after ${out[i - 1]}`).toBe(true)
    }
    expect(new Set(out).size, 'a month appeared twice').toBe(out.length)
  })

  it('drops anything that is not a month key instead of rendering it', () => {
    /*
     * A malformed key reaches `new Date(...)` in the row and throws
     * RangeError out of the render. This screen is inside the Shell, so that
     * throw takes the page, not the row. Refusing the value keeps one bad
     * server row from costing the whole screen - the boundary is the floor,
     * not the fix.
     */
    const bad = ['', '2026', '2026-00', '2026-13', '26-01', '2026-1', 'x', null, undefined, 7, {}, ['2026-01']]
    expect(signoffMonths(bad, bad, [])).toEqual([])
    for (const b of bad) expect(isMonth(b), `accepted ${JSON.stringify(b)}`).toBe(false)
  })

  it('survives both sources being absent', () => {
    /* Loading state: neither query has resolved. The screen shows the floor
     * rather than nothing, and nothing throws. */
    expect(signoffMonths(undefined, undefined, floor('2026-11'))).toEqual(floor('2026-11'))
    expect(signoffMonths(undefined, undefined, [])).toEqual([])
  })
})

describe('isDue', () => {
  const none: ReadonlySet<string> = new Set()

  it('is true only for an ended, unsigned month', () => {
    expect(isDue('2026-10', '2026-11', none)).toBe(true)
  })

  it('is never true for the month in progress', () => {
    /* The current month has not ended, so there is no sheet to have final say
     * on yet. Rendering it as overdue tells a president to act on a period
     * that is still accruing. */
    expect(isDue('2026-11', '2026-11', none)).toBe(false)
  })

  it('is never true for a future month', () => {
    /* Reachable through clock skew or a bad row, and "overdue" would be a
     * false statement about a month that has not happened. */
    expect(isDue('2027-01', '2026-11', none)).toBe(false)
  })

  it('is never true once the month is signed', () => {
    expect(isDue('2026-10', '2026-11', new Set(['2026-10']))).toBe(false)
  })

  it('refuses a malformed month on either side rather than guessing', () => {
    for (const bad of ['', '2026', '2026-13', '2026-00', 'x']) {
      expect(isDue(bad, '2026-11', none), `month ${bad}`).toBe(false)
      expect(isDue('2026-10', bad, none), `cur ${bad}`).toBe(false)
    }
  })

  it('holds across a year boundary without a special case', () => {
    /* The rule, over every adjacent pair in a two-year span, rather than a
     * hand-picked December. Exactly the months before `cur` are due. */
    const months = recentMonths('2026-11', 24)
    for (const m of months) {
      expect(isDue(m, '2026-11', none), `${m} against 2026-11`).toBe(m < '2026-11')
    }
  })
})
