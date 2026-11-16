import { describe, expect, it } from 'vitest'
import { badgeCount, NO_COUNT, pressing, UNKNOWN, type BadgeCount } from './badge'

/*
 * The rule under test is not "badgeCount returns a number". It is that a count
 * which could not be read stays DISTINGUISHABLE from a count of zero, all the
 * way to the renderer. Every assertion here is about that distinction, never
 * about a sample figure.
 */

describe('a count that could not be read is not a count of zero', () => {
  it('undefined is unknown, not zero', () => {
    const c = badgeCount(undefined)
    expect(c.known).toBe(false)
    // The whole point: it must not be mistakable for the real answer `0`.
    expect(c).not.toEqual(NO_COUNT)
  })

  it('null is unknown, not zero', () => {
    expect(badgeCount(null).known).toBe(false)
  })

  it('a real zero stays known', () => {
    const c = badgeCount(0)
    expect(c.known).toBe(true)
    if (c.known) expect(c.n).toBe(0)
  })

  it('every non-count shape is unknown rather than coerced', () => {
    /*
     * Each of these would survive a `typeof n === 'number'` check alone, or
     * would be silently coerced by `Number(n)`, and would then render as a
     * figure the server never sent.
     */
    for (const bad of [NaN, Infinity, -Infinity, -1, 2.5, '3', '', true, false, {}, [], [7]]) {
      expect(badgeCount(bad).known, `${String(bad)} must not be a known count`).toBe(false)
    }
  })

  it('a count at the safe-integer boundary is known; beyond it is not', () => {
    expect(badgeCount(Number.MAX_SAFE_INTEGER).known).toBe(true)
    // Past this, integer arithmetic silently stops being exact, so the figure
    // is no longer something we can claim to know.
    expect(badgeCount(Number.MAX_SAFE_INTEGER + 1).known).toBe(false)
  })
})

describe('UNKNOWN and NO_COUNT are different facts', () => {
  /*
   * This pair is load-bearing in splitTabs: an ABSENT key means the viewer has
   * no obligation on that surface (known), while a FAILED read means we do not
   * know (unknown). Collapsing them makes every badgeless tab pressing and the
   * promotion stops choosing anything.
   */
  it('NO_COUNT is a known zero and UNKNOWN is not known at all', () => {
    expect(NO_COUNT.known).toBe(true)
    expect(UNKNOWN.known).toBe(false)
  })

  it('a known zero is not pressing, an unknown count is', () => {
    expect(pressing(NO_COUNT)).toBe(false)
    expect(pressing(UNKNOWN)).toBe(true)
  })
})

describe('pressing(): what must survive into the bottom bar', () => {
  it('any positive count is pressing', () => {
    for (const n of [1, 2, 41, 1000]) {
      expect(pressing({ known: true, n })).toBe(true)
    }
  })

  it('an unreadable count is pressing, because we cannot claim nothing waits', () => {
    expect(pressing(badgeCount(undefined))).toBe(true)
  })

  it('pressing is decided from `known`, never from a truthiness test on a number', () => {
    /*
     * A `!!c.n` implementation would typecheck, pass the positive cases above,
     * and answer FALSE here - `{known:false}` has no `n`, so `c.n` is
     * undefined and falsy. That is the original bug restated: the unreadable
     * case taking the same branch as the empty one.
     */
    const unreadable = badgeCount('not a number') as BadgeCount
    expect('n' in unreadable).toBe(false)
    expect(pressing(unreadable)).toBe(true)
  })
})
