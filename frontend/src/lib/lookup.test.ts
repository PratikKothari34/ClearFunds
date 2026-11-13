/**
 * `lookup()` is the function that DECIDES which of four states a single-row
 * read is in. The screen only reports that answer, so this drives the
 * decision directly rather than mounting `/my-flat`.
 *
 * The defect it exists to prevent: `dues.data?.find(...)` returns `undefined`
 * for a read in flight, a read that FAILED, and a read that succeeded without
 * the wanted row - and `/my-flat` rendered all three as a loading skeleton.
 * Two of the three therefore shimmered forever, with no error, no retry and
 * nothing in the console. A permanent skeleton is indistinguishable from a
 * slow network, so the resident waits on a page that will never resolve.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lookup } from './lookup'

const ROW = { flat_id: 'f1', outstanding_minor: 125075 }

describe('a single-row lookup reports which of four states it is in', () => {
  it('found, when the row is there', () => {
    const r = lookup({ isPending: false, isError: false }, ROW)
    expect(r.state).toBe('found')
    expect(r.state === 'found' && r.row).toBe(ROW)
  })

  it('loading, while the read is in flight', () => {
    expect(lookup({ isPending: true, isError: false }, undefined).state).toBe('loading')
  })

  it('failed, when the read failed, and it carries the error so a retry can be offered', () => {
    const e = new Error('network')
    const r = lookup({ isPending: false, isError: true, error: e }, undefined)
    expect(r.state).toBe('failed')
    expect(r.state === 'failed' && r.error, 'the error is dropped, so the screen cannot say what went wrong').toBe(e)
  })

  it('absent, when the read SUCCEEDED and the row is simply not in it', () => {
    /*
     * The state that did not exist before. It is reachable, not theoretical:
     * the server owns the row filter, so an open tenure whose dues row the
     * policy does not return lands here, as does a flat removed from the dues
     * table while its tenure stands.
     */
    expect(lookup({ isPending: false, isError: false }, undefined).state).toBe('absent')
  })

  it('never reports a successful empty read as loading', () => {
    /*
     * THE defect, stated as a rule rather than as a state name: a settled
     * read must never be drawn as progress. Both non-loading empty cases.
     */
    for (const q of [
      { isPending: false, isError: false },
      { isPending: false, isError: true, error: new Error('x') },
    ]) {
      expect(lookup(q, undefined).state, `a settled read reported as loading: ${JSON.stringify(q)}`)
        .not.toBe('loading')
    }
  })

  it('never reports a failed read as absent', () => {
    /*
     * A read that did not happen has not established that anything is
     * missing. Calling it absent would tell the resident their flat has no
     * dues record, from no data - a confident wrong answer in place of a
     * recoverable error, and it would hide the retry.
     */
    expect(lookup({ isPending: false, isError: true, error: new Error('x') }, undefined).state)
      .not.toBe('absent')
  })

  it('a row in hand outranks every query flag', () => {
    /*
     * A background refetch sets `isPending` again, and may then fail. The
     * figure on screen was really read, so it must not blink back to a
     * skeleton or to an error card.
     */
    expect(lookup({ isPending: true, isError: false }, ROW).state,
      'a refetch turned a figure already read back into a skeleton').toBe('found')
    expect(lookup({ isPending: false, isError: true, error: new Error('x') }, ROW).state,
      'a failed refetch discarded a figure that had really been read').toBe('found')
  })

  it('treats null and undefined alike, since a parser may return either', () => {
    expect(lookup({ isPending: false, isError: false }, null).state).toBe('absent')
    expect(lookup({ isPending: false, isError: false }, undefined).state).toBe('absent')
  })

  it('does not mistake a falsy row for a missing one', () => {
    /*
     * `if (row)` would call 0, '' and false missing. Nothing passes those
     * today, but the gate is `!= null` and this pins it: a truthiness test
     * here would be the `null <= 0` mistake in a different costume.
     */
    for (const falsy of [0, '', false]) {
      expect(lookup({ isPending: false, isError: false }, falsy as unknown).state,
        `a falsy row (${JSON.stringify(falsy)}) was reported missing`).toBe('found')
    }
  })
})

/*
 * The decision above is only worth anything if the screen actually asks it.
 * `/my-flat` is where the defect lived, and reverting that route to
 * `{!d ? <Loading/> : …}` would leave every test above green while the
 * skeleton shimmered forever again - the wiring IS the fix, so it is asserted
 * too. Read from source with comments stripped, because the prose in both
 * files names every identifier this looks for.
 */
const ROUTE = resolve(__dirname, '..', 'routes', 'my-flat.tsx')
const src = () =>
  readFileSync(ROUTE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')

describe('the flat page asks which state its dues read is in', () => {
  it('reads the route at all', () => {
    expect(src().length, 'my-flat.tsx came back empty: the scan is looking in the wrong place')
      .toBeGreaterThan(800)
  })

  it('imports and calls the decision, rather than testing the row itself', () => {
    const s = src()
    expect(s, 'the route no longer imports lookup()').toMatch(/import\s*\{[^}]*\blookup\b[^}]*\}\s*from\s*'\.\.\/lib\/lookup'/)
    expect(s, 'the route no longer calls lookup()').toMatch(/lookup\(/)
  })

  it('does not gate the whole card on the row being truthy', () => {
    /*
     * The original defect, written as it was: `{!d ? <Loading` - one branch
     * standing in for loading, failed AND absent.
     */
    expect(src(), 'the dues card is gated on `!d` again, so a failed or absent read draws as loading forever')
      .not.toMatch(/\{\s*!d\s*\?\s*<Loading/)
  })

  it('offers a retry when the read failed, and does not draw it as progress', () => {
    const s = src()
    expect(s, "the failed state does not render <Failed>, so there is no retry").toMatch(/'failed'[\s\S]{0,200}<Failed/)
    expect(s, 'the failed state renders a skeleton, which looks like a slow network')
      .not.toMatch(/'failed'\s*\?\s*<Loading/)
  })

  it('says something for a successful read with no row, and does not draw it as progress', () => {
    const s = src()
    expect(s, 'the absent state is not handled, so a successful empty read is silent').toMatch(/'absent'/)
    expect(s, 'the absent state renders a skeleton: a settled read drawn as progress')
      .not.toMatch(/'absent'\s*\?\s*<Loading/)
  })

  it('still renders the entry list, which an absent dues row does not affect', () => {
    /*
     * Overshoot guard. Returning early on `absent` would hide the resident's
     * own payments, which were read successfully and are unrelated to whether
     * a dues row exists. One figure is missing; the page is not empty.
     */
    const s = src()
    expect(s, 'the payments list is gone').toContain('Payments from this flat')
    const absent = s.indexOf("'absent'")
    const list = s.indexOf('Payments from this flat')
    expect(absent, 'the absent branch now sits AFTER the entry list, so it is no longer the dues card')
      .toBeLessThan(list)
    expect(s.slice(absent, list), 'the absent branch returns early, hiding payments that were read fine')
      .not.toMatch(/\breturn\b/)
  })
})
