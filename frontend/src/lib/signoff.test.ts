import { describe, expect, it } from 'vitest'
import { isDue, isMonth, signoffDue, signoffMonths } from './signoff'
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

/*
 * signoffDue is the DASHBOARD's copy of this decision. It is tested here
 * rather than through the home route because the bug it fixes lived at a call
 * site in that route - `recentMonths(cur, 3)` - where the only way to reach it
 * was to mount a router, which is why it survived the fix to the screen beside
 * it. Every test below is about WHICH MONTHS ARE CONSIDERED, never about how a
 * card renders them.
 */
describe('signoffDue', () => {
  const cur = '2026-11'
  /* The floor the dashboard passes: a few recent months, as the old code
   * generated. The point of these tests is that it is a FLOOR and not a
   * horizon. */
  const floor = recentMonths(cur, 3)

  it('keeps an unsigned month OLDER than the rolling window, which is the bug', () => {
    /*
     * The month is far outside any small window from `cur`, has ledger
     * activity, and was never signed. The old card filtered a generated
     * window, so this month was absent - not overdue, absent - and the
     * dashboard said nothing needed the president. Derived from activity, it
     * is still due however long it has been waiting.
     */
    const old = '2025-01'
    expect(floor).not.toContain(old)
    expect(signoffDue([old], [], floor, cur)).toContain(old)
  })

  it('still answers for a month whose activity the summary has not loaded', () => {
    /* The floor only ever ADDS. With no activity read at all, the recent
     * ended months are still offered, so the card is not blank mid-read. */
    const due = signoffDue(undefined, undefined, floor, cur)
    expect(due.length).toBeGreaterThan(0)
    for (const m of due) expect(m < cur).toBe(true)
  })

  it('drops a month once it is signed, whatever its age', () => {
    const old = '2025-01'
    expect(signoffDue([old], [old], floor, cur)).not.toContain(old)
  })

  it('never asks for the current month or a future one', () => {
    /* The current month is in progress; a future month means a clock skew or
     * a bad row. Neither is waiting on anyone. */
    const due = signoffDue([cur, '2027-06', '2026-10'], [], floor, cur)
    expect(due).not.toContain(cur)
    expect(due).not.toContain('2027-06')
    expect(due).toContain('2026-10')
  })

  it('drops a malformed month instead of letting it reach a date formatter', () => {
    for (const bad of ['', '2026', '2026-13', '2026-00', 'x']) {
      expect(signoffDue([bad], [], [], cur), `activity ${bad}`).not.toContain(bad)
    }
  })

  it('agrees with isDue on every month it returns, rather than restating the rule', () => {
    /*
     * The card and the screen must not answer "waiting on me" two ways. This
     * asserts the composition, so an inlined copy of the comparison in either
     * place is a failure rather than a silent second opinion.
     */
    const signed = ['2026-08']
    const activity = ['2025-01', '2026-08', '2026-09', '2026-10', cur]
    const signedSet = new Set(signed)
    const due = signoffDue(activity, signed, floor, cur)
    for (const m of signoffMonths(activity, signed, floor)) {
      expect(due.includes(m), `${m}`).toBe(isDue(m, cur, signedSet))
    }
  })

  it('returns newest first, so a cap on the card drops the OLDEST last', () => {
    /*
     * The caller shows the first few and counts the rest. If the order were
     * reversed, a cap would hide the most recent month and keep the stale
     * ones - and the overflow line would be counting the wrong end.
     */
    const due = signoffDue(['2025-01', '2026-09', '2026-10'], [], [], cur)
    expect(due).toEqual([...due].sort().reverse())
  })
})
