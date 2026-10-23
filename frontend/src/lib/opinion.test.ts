import { describe, expect, it } from 'vitest'
import { isClosed, opinionWords, worstOpinion } from './opinion'
import { OPINION_RANK } from './types'
import type { AuditYear, OpinionSeverity } from './types'

const ALL: readonly OpinionSeverity[] = [
  'clean',
  'qualified',
  'adverse',
  'disclaimer',
]

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
  const year = (y: string, opinion?: OpinionSeverity): AuditYear =>
    opinion
      ? { year: y, closedAt: `${y}-09-18T00:00:00+05:30`, opinion }
      : { year: y }

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
