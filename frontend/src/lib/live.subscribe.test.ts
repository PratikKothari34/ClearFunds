/**
 * `.subscribe()` takes an OPTIONAL status callback, so omitting it typechecks
 * and silently discards `CHANNEL_ERROR`, `TIMED_OUT` and `CLOSED`. That is how
 * it was written: a channel that never connected looked exactly like a society
 * where nobody had posted, and every screen quietly served a five-minute cache
 * with nothing reporting that the live path was gone.
 *
 * The failure is mild - the viewer's own writes still invalidate, window focus
 * still refetches - and mild plus invisible is the combination that lasts.
 *
 * Two things are asserted, and the second is the one that matters:
 *   1. the callback exists at all;
 *   2. it handles every NON-SUBSCRIBED state the installed library can emit,
 *      READ FROM THE LIBRARY'S OWN ENUM rather than from a list copied here.
 *
 * A hand-written list of states is the `flat_set` bug: it matches today and
 * stays green when the library adds a fifth. This reads
 * REALTIME_SUBSCRIBE_STATES, so a new state fails until someone decides about
 * it.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'

const API = resolve(__dirname, 'api.ts')

/*
 * Comments stripped: the prose above `.subscribe()` names every one of these
 * states, so a comment-blind scan would find them all and pass on a file that
 * handles none.
 */
const source = () =>
  readFileSync(API, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')

describe('the realtime subscription reports its own failure', () => {
  it('reads the source and the library enum at all', () => {
    const s = source()
    expect(s.length, 'api.ts came back empty: the scan is looking in the wrong place')
      .toBeGreaterThan(2000)
    expect(s, 'api.ts no longer subscribes to a channel').toContain('.subscribe(')
    /*
     * A floor on the enum, not an exact count. If the import ever resolves to
     * something without these members, every assertion below would pass over
     * an empty set - the vacuous-guard shape.
     */
    expect(Object.values(REALTIME_SUBSCRIBE_STATES).length, 'the realtime status enum is empty')
      .toBeGreaterThan(3)
  })

  it('passes a status callback, rather than discarding the status', () => {
    /*
     * `.subscribe()` with nothing in the parens is the defect. The callback is
     * optional in the type, so this cannot be a compiler check.
     */
    expect(
      /\.subscribe\(\s*\)/.test(source()),
      '.subscribe() has no status callback: CHANNEL_ERROR and TIMED_OUT are being discarded',
    ).toBe(false)
    expect(
      /\.subscribe\(\s*\(/.test(source()),
      '.subscribe() is not passed a function',
    ).toBe(true)
  })

  it('handles every non-subscribed state the installed library can emit', () => {
    const s = source()
    const failures = Object.values(REALTIME_SUBSCRIBE_STATES).filter((v) => v !== 'SUBSCRIBED')
    const unhandled = failures.filter((v) => !s.includes(`'${v}'`)).sort()
    expect(
      unhandled,
      'these realtime failure states are not handled: a channel in one of them leaves every screen stale with nothing saying so',
    ).toEqual([])
  })

  it('responds to a failure by marking the live reads stale', () => {
    /*
     * Not merely observing the status - the point is the consequence. Without
     * this, a dead channel ALSO means a five-minute-old cache from a session
     * that has no live path at all.
     *
     * `refetchType: 'none'` on purpose: a channel that just failed is the
     * wrong moment to fire a dozen requests. Mark stale, let the next mount or
     * window focus re-read.
     */
    const s = source()
    const cb = s.slice(s.indexOf('.subscribe('))
    expect(cb, 'the failure branch does not invalidate anything').toContain('invalidateQueries')
    expect(cb, 'the failure branch should mark stale, not storm the server with refetches')
      .toContain("refetchType: 'none'")
  })

  it('does not treat its own teardown as a channel failure', () => {
    /*
     * `removeChannel()` in the cleanup makes the library invoke the status
     * callback with CLOSED, so a deliberate unmount or a society change takes
     * the SAME branch as a dropped connection. Today that only marks stale on
     * a cache the next mount re-reads, so nothing is visibly wrong - which is
     * why it would survive. It matters because it makes the branch unusable
     * for anything a resident can see: every navigation would report the
     * connection as degraded.
     *
     * Asserted structurally, because this cannot be checked by rendering: the
     * flag must be SET in the cleanup and READ before the branch.
     */
    const s = source()
    /*
     * The DECLARATION, not only the two uses. Deleting `let closing` leaves
     * both uses in place: that does not compile, but vitest does not
     * typecheck, so a test asserting only the uses passed on a file whose
     * flag did not exist. That mutant survived until this line was added.
     */
    expect(s, 'the teardown flag is not declared in the effect').toMatch(/let closing = false/)
    expect(s, 'the cleanup no longer marks the teardown').toMatch(/closing = true/)
    expect(s, 'the status callback no longer checks whether this is our own teardown')
      .toMatch(/if \(closing\) return/)

    const guard = s.indexOf('if (closing) return')
    const branch = s.indexOf("status === 'CHANNEL_ERROR'")
    expect(guard, 'the teardown guard is missing').toBeGreaterThan(-1)
    expect(branch, 'the failure branch is missing').toBeGreaterThan(-1)
    expect(guard, 'the teardown guard must come BEFORE the failure branch, or it guards nothing')
      .toBeLessThan(branch)

    const teardown = s.indexOf('removeChannel')
    expect(s.lastIndexOf('closing = true'), 'the flag must be set before removeChannel, not after')
      .toBeLessThan(teardown)
  })
})
