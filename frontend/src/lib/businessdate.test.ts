/**
 * A DATE THE SERVER WILL REFUSE MUST NOT REACH THE SERVER.
 *
 * `/new` carried `max={todayIST()}` on the date input and nothing read it: the
 * input is not inside a `<form>`, so no implicit validation runs, and the
 * button's `ready` test covered the amount, payee and note only. Driven in the
 * browser, a date of 2027-12-31 left Propose fully enabled with no warning
 * anywhere on the screen, and the refusal came back from `rules.sql` after the
 * click.
 *
 * Tests the function that DECIDES. A render test would prove the message
 * appears once the answer is known, and the answer is the bug.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkBusinessDate, isIsoDate } from './businessdate'

const TODAY = '2026-11-11'

describe('checkBusinessDate', () => {
  it('THE DEFECT: a future date is refused before it can be submitted', () => {
    const r = checkBusinessDate('2027-12-31', TODAY)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toBe('future')
  })

  it('refuses tomorrow, not only a far-off year', () => {
    // The boundary is the bug's edge: an off-by-one here passes every
    // obviously-wrong case and still lets the realistic mistake through.
    expect(checkBusinessDate('2026-11-12', TODAY).ok).toBe(false)
  })

  it('accepts today, which is the common case and must not be refused', () => {
    expect(checkBusinessDate(TODAY, TODAY).ok).toBe(true)
  })

  it('accepts the past, including a date in a previous year', () => {
    for (const d of ['2026-11-10', '2026-01-01', '2019-02-28']) {
      expect(checkBusinessDate(d, TODAY).ok, d).toBe(true)
    }
  })

  it('refuses an empty or malformed date rather than treating it as today', () => {
    for (const d of ['', '11-11-2026', '2026-11', 'yesterday', '2026-13-01', '2026-02-30']) {
      const r = checkBusinessDate(d, TODAY)
      expect(r.ok, d).toBe(false)
      expect(r.ok === false && r.reason, d).toBe('malformed')
    }
  })

  it('refuses rather than approves when it cannot tell what today is', () => {
    /*
     * The safe direction. A caller that cannot supply today has not
     * established that any date is acceptable, and the server still decides -
     * the screen has simply not cleared it.
     */
    expect(checkBusinessDate('2026-11-10', '').ok).toBe(false)
  })

  it('compares as calendar dates, not as parsed Date objects', () => {
    /*
     * `new Date('2026-11-11')` is UTC midnight, which is still 10 Nov in IST.
     * A check that converted would call today "tomorrow" for the first five
     * and a half hours of every Indian day - refusing the most common entry
     * there is, every morning, with a message about the future.
     */
    expect(checkBusinessDate('2026-11-11', '2026-11-11').ok).toBe(true)
    expect(checkBusinessDate('2026-12-31', '2027-01-01').ok).toBe(true)
    expect(checkBusinessDate('2027-01-01', '2026-12-31').ok).toBe(false)
  })

  it('explains what to do instead of only saying no', () => {
    const r = checkBusinessDate('2027-01-01', TODAY)
    expect(r.ok === false && r.message).toMatch(/future/i)
    expect(r.ok === false && r.message).toMatch(/today or earlier/i)
  })
})

describe('isIsoDate', () => {
  it('accepts real calendar dates including a leap day', () => {
    for (const d of ['2024-02-29', '2026-11-11', '2000-01-01']) {
      expect(isIsoDate(d), d).toBe(true)
    }
  })

  it('rejects a date the pattern admits but the calendar does not', () => {
    // The pattern alone passes all of these.
    for (const d of ['2026-02-29', '2026-04-31', '2026-00-10', '2026-11-00']) {
      expect(isIsoDate(d), d).toBe(false)
    }
  })
})

/*
 * THAT THE ROUTE USES IT. Every case above passes on the broken screen, which
 * stated the bound in an attribute and never consulted it.
 */
describe('the new-entry screen is wired to it', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'routes', 'new.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('asks checkBusinessDate about the date', () => {
    expect(src).toMatch(/checkBusinessDate\(date,\s*todayIST\(\)\)/)
  })

  it('THE DEFECT: the submit gate actually depends on the answer', () => {
    /*
     * The heart of it. Computing the check and not putting it in `ready`
     * leaves the button enabled, which is the state the bug was found in and
     * is invisible to any test of the function alone.
     */
    expect(src).toMatch(/const ready = [^\n]*dateCheck\.ok/)
  })

  it('tells the reader what is wrong rather than only greying the button', () => {
    expect(src).toMatch(/dateCheck\.ok \?|!dateCheck\.ok/)
    expect(src).toMatch(/dateCheck\.message/)
  })

  it('keeps max on the input as well, since both are cheap and neither is enough', () => {
    // Defence in depth: `max` still stops the picker offering a future day.
    // It is no longer the only thing standing between a typo and the server.
    expect(src).toMatch(/max=\{todayIST\(\)\}/)
  })
})
