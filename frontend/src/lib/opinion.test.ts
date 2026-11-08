/*
 * THE HEADLINE OPINION IS A CLAIM ABOUT THE HISTORY BESIDE IT.
 *
 * The report took `opinions.headline` and `opinions.headline_seq` from the
 * server and rendered the history directly underneath, so everything needed
 * to check the claim was already on the screen and nothing checked it.
 *
 * The severity order is read out of the contract rather than written here. It
 * is the thing being asserted, and a reordering there - or a fifth opinion -
 * must fail this suite rather than quietly change which opinion governs.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkHeadline, governingSeq } from './opinion'
import type { Opinion } from './types'

const LEDGER = resolve(__dirname, '../../../contracts/chain/kinds/ledger.v1.md')

/** The four opinions, least to most serious, as the contract orders them. */
const contractOpinions = (): Opinion[] => {
  const row = readFileSync(LEDGER, 'utf8')
    .split('\n')
    .find((l) => /^\|\s*\d+\s*\|\s*`opinion`\s*\|/.test(l))
  if (!row) throw new Error(`no opinion row in ${LEDGER}`)
  const vals = [...row.matchAll(/`([a-z]+)`/g)].map((m) => m[1]!).filter((v) => v !== 'opinion')
  if (vals.length < 2) throw new Error(`opinion row lists no values: ${row}`)
  return vals as Opinion[]
}

const RANKED = contractOpinions()
const entry = (seq: number, opinion: Opinion) => ({ seq, opinion })

describe('the contract still orders the opinions', () => {
  it('lists all four, least serious first', () => {
    // Vacuity guard, and the order itself: a disclaimer is WORSE than an
    // adverse opinion, which is the one a reader is most likely to get wrong.
    expect(RANKED).toEqual(['clean', 'qualified', 'adverse', 'disclaimer'])
  })
})

describe('a headline milder than the history is disclosed', () => {
  it('catches every pair where the headline understates what is shown', () => {
    /* THE DEFECT. A server taking the most RECENT opinion instead of the most
     * serious shows a year that went adverse and was revisited as a clean
     * audit, with the adverse entry listed underneath and nothing saying the
     * two disagree. Asserted over every ordered pair, not one example. */
    for (let mild = 0; mild < RANKED.length; mild++) {
      for (let worse = mild + 1; worse < RANKED.length; worse++) {
        const r = checkHeadline(RANKED[mild]!, [entry(1, RANKED[worse]!), entry(2, RANKED[mild]!)])
        const label = `${RANKED[mild]} headline over ${RANKED[worse]}`
        expect(r.state, label).toBe('understated')
        if (r.state === 'understated') expect(r.worst, label).toBe(RANKED[worse])
      }
    }
  })

  it('treats a missing headline over a recorded opinion as understated', () => {
    // A closed year whose opinions exist but whose headline is absent is a
    // claim of "no opinion" contradicted by the entries beside it.
    for (const o of RANKED) {
      expect(checkHeadline(null, [entry(1, o)]).state, o).toBe('understated')
      expect(checkHeadline(undefined, [entry(1, o)]).state, o).toBe('understated')
    }
  })

  it('reports the worst of several, not merely one that is worse', () => {
    const r = checkHeadline('clean', [entry(1, 'qualified'), entry(2, 'disclaimer'), entry(3, 'adverse')])
    expect(r.state).toBe('understated')
    if (r.state === 'understated') expect(r.worst).toBe('disclaimer')
  })
})

describe('a headline the history supports is accepted', () => {
  it('agrees when the headline is the most serious opinion shown', () => {
    for (const o of RANKED) {
      expect(checkHeadline(o, [entry(1, o)]).state, o).toBe('agrees')
    }
    const r = checkHeadline('adverse', [entry(1, 'clean'), entry(2, 'adverse'), entry(3, 'qualified')])
    expect(r.state).toBe('agrees')
  })

  it('accepts the same opinion recorded more than once', () => {
    expect(checkHeadline('qualified', [entry(1, 'qualified'), entry(2, 'qualified')]).state).toBe('agrees')
  })

  it('says nothing to check when no opinion has been recorded', () => {
    expect(checkHeadline(null, []).state).toBe('none')
    expect(checkHeadline(undefined, []).state).toBe('none')
  })
})

describe('a headline more serious than the history is NOT an understatement', () => {
  it('reports it unverifiable, because a shortened history is legitimate', () => {
    /* The over-tightening guard. A view may return a page or a filtered
     * history, so the server's headline being worse than anything on screen
     * is consistent and must not be flagged - crying wrong on an honest
     * report is how a real warning gets ignored. */
    for (let worse = 1; worse < RANKED.length; worse++) {
      for (let mild = 0; mild < worse; mild++) {
        const r = checkHeadline(RANKED[worse]!, [entry(1, RANKED[mild]!)])
        expect(r.state, `${RANKED[worse]} over ${RANKED[mild]}`).toBe('unverifiable')
      }
    }
  })

  it('reports a headline with an empty history as unverifiable, never agreed', () => {
    // Nothing on screen supports it, so it is not confirmed by anything.
    for (const o of RANKED) expect(checkHeadline(o, []).state, o).toBe('unverifiable')
  })
})

describe('the governs marker goes on the entry that actually governs', () => {
  it('uses the server seq when it carries the headline opinion', () => {
    const h = [entry(5, 'clean'), entry(9, 'adverse')]
    expect(governingSeq('adverse', 9, h)).toBe(9)
  })

  it('never marks an entry milder than the headline', () => {
    /* A headline_seq pointing at the clean entry tells a resident the clean
     * opinion is the one that counts - worse than marking none at all. */
    const h = [entry(5, 'clean'), entry(9, 'adverse')]
    expect(governingSeq('adverse', 5, h)).toBe(9)
    expect(governingSeq('adverse', 404, h)).toBe(9)
    expect(governingSeq('adverse', null, h)).toBe(9)
    expect(governingSeq('adverse', undefined, h)).toBe(9)
  })

  it('marks nothing when no entry carries the headline opinion', () => {
    expect(governingSeq('disclaimer', 5, [entry(5, 'clean')])).toBeNull()
    expect(governingSeq('clean', 1, [])).toBeNull()
  })

  it('marks nothing when there is no headline', () => {
    expect(governingSeq(null, 5, [entry(5, 'clean')])).toBeNull()
    expect(governingSeq(undefined, 5, [entry(5, 'clean')])).toBeNull()
  })

  it('picks the first entry carrying the opinion when the seq is wrong', () => {
    const h = [entry(2, 'adverse'), entry(7, 'adverse')]
    expect(governingSeq('adverse', 99, h)).toBe(2)
  })
})
