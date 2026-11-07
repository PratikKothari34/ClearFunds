import { describe, expect, it } from 'vitest'
import { countable, direction, owing, partition } from './countable'
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

/* ui.tsx:96's own partition, as the reference the chip must agree with. */
const colour = (m: number) => (m < 0 ? 'debit' : m > 0 ? 'credit' : 'ink')

describe('direction', () => {
  /*
   * The defect: `minor < 0 ? out : in` on the entry screen, so a zero
   * amount asserted "Money in" about an entry that moved nothing. The proof
   * it was wrong rather than merely unusual is that <Amount> on the SAME
   * screen, reading the SAME field, already partitioned three ways - so the
   * hero figure rendered neutral while the chip beside it claimed credit.
   */

  it('answers four ways, because a signed amount has three states', () => {
    expect(direction(-1)).toBe('out')
    expect(direction(1)).toBe('in')
    expect(direction(0)).toBe('flat')
    expect(direction(null)).toBe('unreadable')
  })

  it('never calls a zero amount a direction', () => {
    // The whole bug in one assertion. Both halves matter: a fix that
    // flipped the fallthrough would make zero read as "Money out" instead,
    // which is equally a claim about money that did not move.
    expect(direction(0)).not.toBe('in')
    expect(direction(0)).not.toBe('out')
  })

  it('never calls an unreadable amount flat, which would read as settled', () => {
    // 'flat' is a positive claim: the balance did not change. An amount
    // nobody could read supports no claim at all, and `null > 0` is false
    // while `null < 0` is false too - so a two-way test lands here by
    // accident rather than by decision.
    for (const [name, v] of unreadable) {
      expect(direction(v), `${name} read as a flat balance`).toBe('unreadable')
    }
  })

  it('agrees with countable about what is readable', () => {
    // Two readers of one field. If they ever disagree, one surface shows a
    // figure the other refuses, which is how the entry screen and the
    // ledger came to describe the same row differently.
    for (const v of [...unreadable.map(([, x]) => x), -250000, -1, 0, 1, 250000]) {
      expect(direction(v) === 'unreadable', `disagreed about ${String(v)}`).toBe(!countable(v).readable)
    }
  })

  it('agrees with owing() on which amounts are money in', () => {
    for (const v of [...unreadable.map(([, x]) => x), -1, 0, 1, 999]) {
      expect(direction(v) === 'in', `disagreed about ${String(v)}`).toBe(owing(v))
    }
  })

  it('matches the three-way partition <Amount> colours by', () => {
    /*
     * ui.tsx:96 is `minor < 0 ? debit : minor > 0 ? credit : ink`. That line
     * is the one that was already right, so it is the reference here: a
     * direction that disagreed with the colour beside it is the defect
     * reappearing on another surface.
     */
    const expected = { out: 'debit', in: 'credit', flat: 'ink' } as const
    for (const m of [-999999, -1, 0, 1, 999999]) {
      const d = direction(m)
      expect(d === 'unreadable').toBe(false)
      expect(expected[d as 'out' | 'in' | 'flat'], `direction disagreed with the colour at ${m}`).toBe(colour(m))
    }
  })

  it('reads a reversal as the opposite of its target, with no third source of truth', () => {
    // A reversal is the negation of what it reverses (ledger.v1.md:104), so
    // the direction of the pair must be opposite for every readable amount
    // - asserted as a rule over the sign, not against a sample figure.
    for (const m of [1, 250000, Number.MAX_SAFE_INTEGER]) {
      expect(direction(m)).toBe('in')
      expect(direction(-m)).toBe('out')
    }
  })
})
