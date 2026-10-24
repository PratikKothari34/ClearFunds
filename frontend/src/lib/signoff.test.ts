import { describe, expect, it } from 'vitest'
import {
  hasUnplaceablePeriods,
  oldestUnsigned,
  signable,
  waitingBehind,
} from './signoff'
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
    // The sample's ids are all well-formed, so `signable` is the whole
    // list here. Asserted through it anyway, so the expectation states
    // the rule rather than depending on that staying true.
    expect(waitingBehind(SAMPLE_SIGNOFF)).toBe(
      signable(SAMPLE_SIGNOFF).length - 1,
    )
  })

  it('does not count a month it cannot place in the calendar', () => {
    /*
     * THE TWO FUNCTIONS MUST AGREE. `oldestUnsigned` refuses a period
     * whose id does not parse, so counting it here would tell the
     * president months are waiting behind one that this module will
     * never offer them - inflating the only figure on that page that
     * says how far behind they are.
     */
    const mixed = [
      period('s-2026-07'),
      period('s-2026-08'),
      period('s-2026-4'),
      period('s-2026-00'),
      period(''),
    ]
    expect(waitingBehind(mixed)).toBe(1)
  })

  it('is zero when no period can be placed', () => {
    expect(waitingBehind([period('nonsense'), period('s-2026-13')])).toBe(0)
  })
})

/*
 * ABSENT, EMPTY AND UNUSABLE ARE THREE STATES, and the third had no
 * way to be told from the second.
 *
 * `oldestUnsigned` returns undefined both when every month has been
 * signed and when months are listed with ids none of which parse. The
 * route took that undefined and rendered "Every month up to now has
 * been signed off." - a compliance claim read by a president deciding
 * whether anything needs their signature, and the sharpest false
 * statement available on that page.
 */
describe('hasUnplaceablePeriods', () => {
  it('is false for an empty list, which really is the all-clear', () => {
    expect(hasUnplaceablePeriods([])).toBe(false)
  })

  it('is false when at least one period can be placed', () => {
    expect(
      hasUnplaceablePeriods([period('nonsense'), period('s-2026-07')]),
    ).toBe(false)
  })

  it('is true when months are listed and none can be read', () => {
    for (const bad of ['', 'nonsense', 's-2026-4', 's-2026-00', 's-2026-13']) {
      expect(hasUnplaceablePeriods([period(bad)]), bad).toBe(true)
    }
  })

  it('agrees with oldestUnsigned about what cannot be placed', () => {
    /*
     * Derived, not listed again: if the two ever disagree the route
     * reaches one branch while the other was the true one, which is
     * exactly the shape of the original bug - restated between two
     * functions instead of between a function and a route.
     */
    const lists = [
      [],
      [period('s-2026-07')],
      [period('nonsense')],
      [period('nonsense'), period('s-2026-07')],
      [period('s-2026-13'), period('')],
    ]
    for (const list of lists) {
      const unplaceable = hasUnplaceablePeriods(list)
      const noneOffered = oldestUnsigned(list) === undefined
      // Unusable implies nothing is offered, and anything offered
      // implies not unusable. The reverse does not hold: an empty list
      // offers nothing and is not unusable, which is the distinction.
      if (unplaceable) expect(noneOffered, JSON.stringify(list)).toBe(true)
      if (!noneOffered) expect(unplaceable, JSON.stringify(list)).toBe(false)
    }
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
