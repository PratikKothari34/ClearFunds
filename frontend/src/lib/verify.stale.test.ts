import { describe, expect, it } from 'vitest'
import { stepsView, type Check } from './verify'

/*
 * The decision behind the /verify Steps rows: what may a screen show from a
 * prior check when the current run failed?
 *
 * This is the deciding function, not the presenter. A render test of the rows
 * would speak only for the screen it mounts - it cannot prove that a failed
 * run is distinguished from a finished one, because both arrive holding the
 * same cached Check.
 */

const cached = (at: number): Check =>
  ({
    at,
    entries: 3,
    head: { seq: 3, hash: 'abc' },
    chain: 'ok',
    signatures: { checked: 2, failed: [] },
    device: 'consistent',
    anchor: 'matches',
    unchecked: [],
    regressed: [],
  }) as unknown as Check

describe('stepsView', () => {
  it('reports a finished run as current', () => {
    const at = Date.now()
    expect(stepsView(cached(at), { running: false, failed: false })).toEqual({ show: 'current' })
  })

  it('shows nothing when nothing is cached and nothing ran', () => {
    expect(stepsView(null, { running: false, failed: false })).toEqual({ show: 'none' })
  })

  it('shows nothing rather than a stale pass when the first run fails', () => {
    // No cache to fall back on: an absent check must read as absent, never
    // as a pass.
    expect(stepsView(null, { running: false, failed: true })).toEqual({ show: 'none' })
  })

  it('never reports a current result when the run failed', () => {
    // The defect this function exists to prevent: a failed run holding a
    // cached check rendered green, as though it were the run that just ran.
    const v = stepsView(cached(1), { running: false, failed: true })
    expect(v.show).not.toBe('current')
    expect(v.show).toBe('stale')
  })

  it('carries the cached check own date, so a stale reading cannot be shown undated', () => {
    // The date is returned by the decision, not looked up by the caller:
    // the only way to render 'stale' is to be handed what to attribute it to.
    const at = 1_700_000_000_000
    const v = stepsView(cached(at), { running: false, failed: true })
    expect(v).toEqual({ show: 'stale', at })
    expect('at' in v && v.at).toBe(at)
  })

  it('reads the failure before the data, not after', () => {
    // A failed run arrives WITH a cached check in hand. If the presence of
    // data were checked first, this case would return 'current'.
    const withData = stepsView(cached(1), { running: false, failed: true })
    expect(withData.show).toBe('stale')
  })

  it('prefers running over every other state', () => {
    // A re-run in flight must not redraw the old findings as though they
    // described it, whether or not the previous attempt failed.
    expect(stepsView(cached(1), { running: true, failed: false })).toEqual({ show: 'running' })
    expect(stepsView(cached(1), { running: true, failed: true })).toEqual({ show: 'running' })
    expect(stepsView(null, { running: true, failed: false })).toEqual({ show: 'running' })
  })

  it('distinguishes all four outcomes, so no two collapse into one', () => {
    // Three states would force a failed run to share an arm with either a
    // finished one (a false pass) or an empty one (a lost finding).
    const seen = new Set(
      [
        stepsView(cached(1), { running: true, failed: false }),
        stepsView(null, { running: false, failed: false }),
        stepsView(cached(1), { running: false, failed: true }),
        stepsView(cached(1), { running: false, failed: false }),
      ].map((v) => v.show),
    )
    expect(seen).toEqual(new Set(['running', 'none', 'stale', 'current']))
  })
})
