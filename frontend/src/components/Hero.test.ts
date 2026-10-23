import { describe, expect, it } from 'vitest'
import {
  HERO_FLOOR_MS,
  HERO_HOLD_PERCENT,
  HERO_SLOW_MS,
  strokePercent,
} from './Hero'

/*
 * The hero's honesty is arithmetic, so it is tested as arithmetic.
 *
 * The failure these tests prevent is the one the design calls out by
 * name: a progress indicator that completes while a request is still
 * outstanding. That is indistinguishable from a working loader on a
 * fast connection and a lie on a slow one, which is exactly the kind of
 * bug that ships.
 */

describe('strokePercent', () => {
  it('never reaches 100, at any elapsed time', () => {
    // The central guarantee. 100% is reserved for actual completion,
    // which is a state change, not a point on this curve.
    for (const ms of [0, 1, 400, 1000, 4000, 10_000, 60_000, 3_600_000]) {
      expect(strokePercent(ms), `at ${ms}ms`).toBeLessThan(100)
    }
  })

  it('holds at the cap rather than creeping past it', () => {
    expect(strokePercent(600_000)).toBeLessThanOrEqual(HERO_HOLD_PERCENT)
    // Far past any plausible wait, it is still exactly at the hold, not
    // drifting.
    expect(strokePercent(86_400_000)).toBeCloseTo(HERO_HOLD_PERCENT, 5)
  })

  it('is at the cap by the time the copy says the connection is slow', () => {
    // The two have to agree: a stroke still visibly moving while the
    // copy says it has stalled reads as a broken page.
    expect(strokePercent(HERO_SLOW_MS)).toBeGreaterThan(
      HERO_HOLD_PERCENT * 0.85,
    )
  })

  it('starts at zero and never goes negative', () => {
    expect(strokePercent(0)).toBe(0)
    expect(strokePercent(-500)).toBe(0)
  })

  it('increases monotonically', () => {
    // A stroke that goes backwards suggests the load regressed.
    let previous = -1
    for (let ms = 0; ms <= 20_000; ms += 250) {
      const value = strokePercent(ms)
      expect(value, `at ${ms}ms`).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  it('has moved visibly by the time the hero first renders', () => {
    // At the floor the stroke is the first thing seen. Rendering it at
    // zero width looks like nothing happened.
    expect(strokePercent(HERO_FLOOR_MS)).toBeGreaterThan(5)
  })
})

describe('hero thresholds', () => {
  it('floors at 400ms', () => {
    // Below this a hero is a flash. The number is the design's, not an
    // implementation detail to tune.
    expect(HERO_FLOOR_MS).toBe(400)
  })

  it('holds below full', () => {
    expect(HERO_HOLD_PERCENT).toBeLessThan(100)
  })

  it('declares slow well after the floor', () => {
    expect(HERO_SLOW_MS).toBeGreaterThan(HERO_FLOOR_MS * 4)
  })
})
