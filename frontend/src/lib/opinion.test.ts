import { describe, expect, it } from 'vitest'
import {
  isClosed,
  isKnownOpinion,
  opinionWords,
  unrankableYears,
  worstOpinion,
} from './opinion'
import { OPINION_RANK } from './types'
import type { AuditYear, OpinionSeverity } from './types'

const ALL: readonly OpinionSeverity[] = [
  'clean',
  'qualified',
  'adverse',
  'disclaimer',
]

// One builder for both the ranking and the unreadable-opinion tests,
// so neither can be asserted against a shape the other does not use.
const year = (y: string, opinion?: OpinionSeverity): AuditYear =>
  opinion
    ? { year: y, closedAt: `${y}-09-18T00:00:00+05:30`, opinion }
    : { year: y }

/*
 * These tests guard wording, not behaviour, which is unusual and
 * deliberate. The strings they check were confirmed with a practising
 * chartered accountant, and the failure they prevent is a later edit
 * that makes the copy read better and says something the product is
 * not entitled to say. A reviewer looking at such an edit in isolation
 * would approve it; only a test stops it.
 */

describe('opinion wording', () => {
  it('never claims the auditor certified, verified or confirmed anything', () => {
    // The exact failure this prevents: copy that says the auditor
    // "confirmed the accounts are correct". An audit offers reasonable
    // assurance and never a guarantee.
    const forbidden = [
      'certif', // certified, certifies, certification
      'verif', // verified, verifies, verification
      'confirm',
      'guarantee',
      'proves',
      'proof',
      'accurate',
      'correct',
    ]

    for (const opinion of ALL) {
      const words = opinionWords(opinion).toLowerCase()
      for (const term of forbidden) {
        expect(
          words,
          `"${opinion}" wording must not contain "${term}"`,
        ).not.toContain(term)
      }
    }
  })

  it('says reasonable assurance where assurance was given', () => {
    expect(opinionWords('clean')).toContain('reasonable assurance')
    expect(opinionWords('qualified')).toContain('reasonable assurance')
  })

  it('does not claim assurance where none was given', () => {
    // An adverse opinion and a disclaimer are not assurance with a
    // caveat; saying "reasonable assurance" in either would invert the
    // meaning.
    expect(opinionWords('adverse')).not.toContain('reasonable assurance')
    expect(opinionWords('disclaimer')).not.toContain('reasonable assurance')
  })

  it('tells the reader a disclaimer is the most serious outcome', () => {
    // Residents do not know the ranking. A disclaimer sounds mild and
    // is the worst, so the words have to carry what the ranking knows.
    expect(opinionWords('disclaimer')).toContain('most serious')
  })

  it('has wording for every opinion', () => {
    for (const opinion of ALL) {
      expect(opinionWords(opinion).length).toBeGreaterThan(20)
    }
  })
})

describe('opinion ranking', () => {
  it('ranks a disclaimer above an adverse opinion', () => {
    // The whole reason the ranking is explicit. Alphabetical or
    // intuitive ordering puts adverse last and gets this backwards.
    expect(OPINION_RANK.disclaimer).toBeGreaterThan(OPINION_RANK.adverse)
  })

  it('ranks clean < qualified < adverse < disclaimer', () => {
    expect(OPINION_RANK.clean).toBeLessThan(OPINION_RANK.qualified)
    expect(OPINION_RANK.qualified).toBeLessThan(OPINION_RANK.adverse)
    expect(OPINION_RANK.adverse).toBeLessThan(OPINION_RANK.disclaimer)
  })
})

describe('worstOpinion', () => {

  it('returns the most serious, not the latest', () => {
    // The headline failure: a clean year after a disclaimer would
    // report "clean" if the code took the newest entry.
    const years = [year('2026-27', 'clean'), year('2025-26', 'disclaimer')]
    expect(worstOpinion(years)).toBe('disclaimer')
  })

  it('picks a disclaimer over an adverse opinion', () => {
    expect(worstOpinion([year('a', 'adverse'), year('b', 'disclaimer')])).toBe(
      'disclaimer',
    )
  })

  it('ignores open years rather than treating them as clean', () => {
    // An open year has no opinion. Counting it as clean would let an
    // unaudited year improve the headline.
    const years = [year('2026-27'), year('2025-26', 'qualified')]
    expect(worstOpinion(years)).toBe('qualified')
  })

  it('returns undefined when no year has an opinion', () => {
    expect(worstOpinion([year('2026-27'), year('2025-26')])).toBeUndefined()
    expect(worstOpinion([])).toBeUndefined()
  })

  it('never promotes an opinion value it does not recognise to the headline', () => {
    /*
     * An unranked value - 'unqualified' is the real-world term a
     * backend or an auditor's own system might send for what this
     * product calls 'clean' - has no entry in OPINION_RANK, so the
     * comparison against it is `undefined > n`, which is false. It is
     * therefore skipped rather than ranked.
     *
     * Skipping is the safe direction: the headline can only ever be a
     * value this product knows the severity of, so it cannot print a
     * word whose seriousness it cannot order. The cost is that a value
     * nobody here recognised is INVISIBLE in the headline, which is
     * why the wire contract must be a fixed enum and not free text -
     * stated here so the constraint is testable rather than assumed.
     */
    const unranked = [
      { year: '2025-26', opinion: 'unqualified' },
    ] as unknown as AuditYear[]
    expect(worstOpinion(unranked)).toBeUndefined()
  })

  it('still finds the worst known opinion when an unknown one sits beside it', () => {
    // The unknown value must not mask a real one, and must not win.
    const mixed = [
      { year: '2025-26', opinion: 'unqualified' },
      { year: '2024-25', opinion: 'disclaimer' },
    ] as unknown as AuditYear[]
    expect(worstOpinion(mixed)).toBe('disclaimer')
  })

  it('treats a null opinion from JSON as no opinion, not as clean', () => {
    // JSON has no undefined. `if (!year.opinion) continue` catches
    // both, which is what makes an open year stay out of the headline.
    const asJson = [
      { year: '2026-27', opinion: null },
      { year: '2025-26', opinion: 'qualified' },
    ] as unknown as AuditYear[]
    expect(worstOpinion(asJson)).toBe('qualified')
  })
})

describe('isClosed', () => {
  it('is closed only when an auditor signed off', () => {
    expect(isClosed({ year: '2025-26', closedAt: '2026-09-18T00:00:00+05:30' })).toBe(
      true,
    )
  })

  it('is open when there is no sign-off, however old the year', () => {
    // A year from 2019 with no auditor sign-off is still open. Time
    // does not close books, and neither does the committee.
    expect(isClosed({ year: '2018-19' })).toBe(false)
  })
})

describe('isKnownOpinion', () => {
  /*
   * `opinionWords` is a switch over the four cases with no default, so
   * an off-enum value returns undefined and the page rendered the
   * sentence "The auditor gave ." - which reads as a broken product
   * rather than as a record the product could not read.
   */
  it('accepts every opinion the product can describe', () => {
    for (const opinion of ALL) {
      expect(isKnownOpinion(opinion)).toBe(true)
    }
  })

  it('rejects a value this product does not rank', () => {
    /*
     * 'unqualified' is the real-world term an auditor's own system may
     * send for what this product calls 'clean'. It is the realistic
     * off-enum value, not a contrived one.
     */
    for (const value of ['unqualified', 'except for', '', 'CLEAN']) {
      expect(isKnownOpinion(value)).toBe(false)
    }
  })

  it('gates exactly the values opinionWords can answer for', () => {
    /*
     * The two must not drift: a value this predicate admits and
     * `opinionWords` cannot describe is the original bug restored.
     */
    for (const opinion of ALL) {
      expect(opinionWords(opinion)).toBeTruthy()
    }
  })
})

describe('unrankableYears', () => {
  /*
   * `worstOpinion` skips what it cannot rank, and it has to - it must
   * still answer for the years it can read. But the skip fails in the
   * dangerous direction: a society with a disclaimer recorded off-enum
   * would show a headline of "reasonable assurance". The best possible
   * answer, derived from the worst possible record. So the page says
   * what it could not read, beside the headline computed without it.
   */
  it('names no year when every opinion is readable', () => {
    const years = ALL.map((opinion, i) => year(`2020-2${i}`, opinion))
    expect(unrankableYears(years)).toEqual([])
  })

  it('names the year whose opinion could not be ranked', () => {
    const years = [
      year('2024-25', 'clean'),
      year('2025-26', 'unqualified' as OpinionSeverity),
    ]
    expect(unrankableYears(years)).toEqual(['2025-26'])
  })

  it('does not name a year that simply has no opinion yet', () => {
    /*
     * An open year is not an unreadable one. Naming it would put a
     * warning beside the headline every year before the audit lands.
     */
    expect(unrankableYears([year('2025-26', undefined)])).toEqual([])
  })

  it('treats a null opinion from JSON as no opinion', () => {
    /*
     * JSON has no undefined, so the wire sends null. An `=== undefined`
     * check would call that unreadable and raise a warning on every
     * open year.
     */
    const fromJson = JSON.parse('[{"year":"2025-26","opinion":null}]') as
      AuditYear[]
    expect(unrankableYears(fromJson)).toEqual([])
  })

  it('finds every unreadable year, not just the first', () => {
    const years = [
      year('2023-24', 'except for' as OpinionSeverity),
      year('2024-25', 'clean'),
      year('2025-26', 'unqualified' as OpinionSeverity),
    ]
    expect(unrankableYears(years)).toEqual(['2023-24', '2025-26'])
  })

  it('is non-empty exactly when worstOpinion dropped something', () => {
    /*
     * The pairing IS the rule: the headline above is wrong whenever
     * this list is non-empty, and a reader has no other way to know
     * that. A year whose opinion is dropped must always be named.
     */
    const dropped = [year('2025-26', 'unqualified' as OpinionSeverity)]
    expect(worstOpinion(dropped)).toBeUndefined()
    expect(unrankableYears(dropped).length).toBeGreaterThan(0)

    const readable = [year('2025-26', 'disclaimer')]
    expect(worstOpinion(readable)).toBe('disclaimer')
    expect(unrankableYears(readable)).toEqual([])
  })

  it('returns an empty list for no years at all', () => {
    expect(unrankableYears([])).toEqual([])
  })
})
