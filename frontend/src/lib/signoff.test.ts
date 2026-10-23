import { describe, expect, it } from 'vitest'
import { oldestUnsigned, waitingBehind } from './signoff'
import { SAMPLE_SIGNOFF } from './sample'
import type { SignoffPeriod } from './types'

function period(id: string): SignoffPeriod {
  return {
    id,
    label: id,
    inflow: { minor: 100, currency: 'INR' },
    outflow: { minor: 50, currency: 'INR' },
    entryCount: 1,
    openFlagCount: 0,
    structuring: [],
  }
}

describe('oldestUnsigned', () => {
  it('returns undefined when nothing is unsigned', () => {
    expect(oldestUnsigned([])).toBeUndefined()
  })

  it('picks the earliest month, not the first element', () => {
    // The case the old `periods[0]` got wrong. A payload ordered
    // newest-first would have put the president on September while the
    // heading said "oldest month not signed".
    const newestFirst = [
      period('s-2026-09'),
      period('s-2026-08'),
      period('s-2026-07'),
    ]
    expect(oldestUnsigned(newestFirst)?.id).toBe('s-2026-07')
  })

  it('is independent of input order', () => {
    const ids = ['s-2026-07', 's-2026-08', 's-2026-09']
    const orderings = [
      [0, 1, 2],
      [2, 1, 0],
      [1, 2, 0],
      [2, 0, 1],
    ]
    for (const order of orderings) {
      const input = order.map((i) => period(ids[i] as string))
      expect(oldestUnsigned(input)?.id, order.join(',')).toBe('s-2026-07')
    }
  })

  it('crosses a year boundary correctly', () => {
    // Lexicographic order on `s-YYYY-MM` is calendar order, so
    // December 2026 must not beat January 2027.
    const across = [period('s-2027-01'), period('s-2026-12')]
    expect(oldestUnsigned(across)?.id).toBe('s-2026-12')
  })

  it('does not treat a zero-padded month as larger', () => {
    // `s-2026-10` vs `s-2026-09`: string comparison gets this right
    // only because the month is zero-padded to two digits. If an id
    // were ever emitted unpadded this test fails, which is the point.
    const padded = [period('s-2026-10'), period('s-2026-09')]
    expect(oldestUnsigned(padded)?.id).toBe('s-2026-09')
  })

  it('picks the single period when there is only one', () => {
    expect(oldestUnsigned([period('s-2026-04')])?.id).toBe('s-2026-04')
  })
})

describe('waitingBehind', () => {
  it('is zero for none and for one', () => {
    expect(waitingBehind([])).toBe(0)
    expect(waitingBehind([period('s-2026-04')])).toBe(0)
  })

  it('counts every period except the one on screen', () => {
    expect(waitingBehind(SAMPLE_SIGNOFF)).toBe(SAMPLE_SIGNOFF.length - 1)
  })
})

describe('the sample exercises the rule', () => {
  it('has more than one unsigned period', () => {
    // With one period the oldest-unsigned rule is unexercised and a
    // regression that rendered the whole list would look correct.
    expect(SAMPLE_SIGNOFF.length).toBeGreaterThan(1)
  })

  it('makes the oldest the one carrying the warnings', () => {
    // The president's "something should give you pause" path is what
    // renders by default, rather than being reachable only by editing
    // fixtures.
    const oldest = oldestUnsigned(SAMPLE_SIGNOFF)
    expect(oldest).toBeDefined()
    expect(
      (oldest?.openFlagCount ?? 0) > 0 ||
        (oldest?.structuring.length ?? 0) > 0,
    ).toBe(true)
  })
})
