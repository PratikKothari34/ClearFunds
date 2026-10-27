import { describe, expect, it } from 'vitest'
import { countable, owing, partition } from './countable'
import { parts } from './money'

/*
 * These assert the RULE, not sample numbers. The bug was a wrong branch for
 * an unreadable value, so every case here is about which of the three
 * outcomes a value produces - never about a particular rupee figure.
 */

/* Everything money.ts cannot format, and everything JS compares wrongly. */
const unreadable: [string, unknown][] = [
  ['null', null],
  ['undefined', undefined],
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
  ['a float', 12.5],
  ['a numeric string', '1250'],
  ['an empty string', ''],
  ['a boolean', false],
  ['past 2^53', Number.MAX_SAFE_INTEGER + 1],
]

describe('an amount that cannot be read', () => {
  for (const [name, value] of unreadable) {
    it(`${name} is not readable`, () => {
      expect(countable(value).readable).toBe(false)
    })

    it(`${name} is not reported as owing`, () => {
      expect(owing(value)).toBe(false)
    })

    /*
     * The actual defect: JS puts null on the same side of both comparisons
     * as a flat that has paid. If this module ever collapses to two
     * outcomes, these two assertions are what disagree.
     */
    it(`${name} is not treated as settled either`, () => {
      const p = partition([{ v: value }], (r) => r.v)
      expect(p.settled).toHaveLength(0)
      expect(p.owing).toHaveLength(0)
      expect(p.unreadable).toHaveLength(1)
    })

    it(`${name} is never handed to money.ts, which would throw`, () => {
      const c = countable(value)
      if (c.readable) expect(() => parts(c.minor, 'INR')).not.toThrow()
      else expect(() => parts(value as number, 'INR')).toThrow(RangeError)
    })
  }
})

describe('an amount that can be read', () => {
  it('a positive amount is owing', () => {
    const c = countable(1)
    expect(c.readable && c.owing).toBe(true)
  })

  it('zero is readable and not owing', () => {
    const c = countable(0)
    expect(c.readable).toBe(true)
    expect(c.readable && c.owing).toBe(false)
  })

  /* 0 is what the contract says arrives when nothing applies, so it must be
   * settled rather than unreadable - the opposite error from the original. */
  it('zero is settled, not unreadable', () => {
    const p = partition([{ v: 0 }], (r) => r.v)
    expect(p.settled).toHaveLength(1)
    expect(p.unreadable).toHaveLength(0)
  })

  /* A credit balance is not money owed. */
  it('a negative amount is readable and not owing', () => {
    const c = countable(-1)
    expect(c.readable).toBe(true)
    expect(c.readable && c.owing).toBe(false)
  })

  it('every readable amount survives money.ts', () => {
    for (const v of [0, 1, -1, Number.MAX_SAFE_INTEGER]) {
      const c = countable(v)
      expect(c.readable).toBe(true)
      expect(() => parts(v, 'INR')).not.toThrow()
    }
  })
})

describe('partition', () => {
  it('returns every row exactly once', () => {
    const rows = [{ v: 1 }, { v: 0 }, { v: null }, { v: -1 }, { v: NaN }]
    const p = partition(rows, (r) => r.v)
    expect(p.owing.length + p.settled.length + p.unreadable.length).toBe(rows.length)
    expect(new Set([...p.owing, ...p.settled, ...p.unreadable]).size).toBe(rows.length)
  })

  /*
   * The count shown to a treasurer must never be lower than the truth. An
   * unreadable row is disclosed separately, so owing + unreadable is the
   * number of flats that MIGHT owe - which is the number worth chasing.
   */
  it('never reports fewer flats to chase than could owe', () => {
    const rows = [{ v: 1 }, { v: null }, { v: 0 }]
    const p = partition(rows, (r) => r.v)
    const mightOwe = p.owing.length + p.unreadable.length
    const definitelySettled = p.settled.length
    expect(mightOwe + definitelySettled).toBe(rows.length)
    expect(p.unreadable.length).toBeGreaterThan(0)
  })

  it('keeps an empty input empty in all three buckets', () => {
    const p = partition([], (r: { v: unknown }) => r.v)
    expect([p.owing, p.settled, p.unreadable].every((b) => b.length === 0)).toBe(true)
  })
})
