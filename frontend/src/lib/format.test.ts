import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { categoryLabel, flatSetLabel, headlineOpinion, opinionChip, opinionTone, worseOpinion, writeOutcome } from './format'
import { PROPOSAL_STATES } from './types'
import type { Opinion } from './types'

/*
 * `flat_set` says which flats a charge hits, on the screen where a committee
 * member decides whether to approve it. The contract defines the values, and
 * `flat` was added after the screen was written: a binary "is it parking?"
 * check rendered a one-flat charge as "Every flat".
 *
 * So the values are read from the contract rather than hardcoded here. A value
 * added to the contract next fails this test instead of silently rendering as
 * the catch-all, which is the whole failure being guarded against.
 */
const LEDGER = resolve(__dirname, '../../../contracts/chain/kinds/ledger.v1.md')

const contractFlatSets = (): string[] => {
  const row = readFileSync(LEDGER, 'utf8')
    .split('\n')
    .find((l) => /^\|\s*\d+\s*\|\s*`flat_set`\s*\|/.test(l))
  if (!row) throw new Error(`no flat_set row in ${LEDGER}`)
  const clause = /`charge`:\s*((?:`[a-z_]+`(?:,\s*|\s+or\s+)?)+)/.exec(row)
  if (!clause) throw new Error(`flat_set row does not list its values: ${row}`)
  return [...clause[1]!.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!)
}

describe('flatSetLabel', () => {
  it('reads the contract row, so this suite cannot go stale silently', () => {
    const values = contractFlatSets()
    // Not an assertion on the count: a third value arriving is the point. This
    // only proves the parse found a list rather than an empty match.
    expect(values.length).toBeGreaterThan(1)
    expect(new Set(values).size).toBe(values.length)
  })

  it('labels every value the contract defines, each distinctly', () => {
    const values = contractFlatSets()
    const labels = values.map(flatSetLabel)
    // A value the contract declares must never read as the unknown catch-all:
    // that is the lie this guard exists to stop.
    const unknown = flatSetLabel('cf-not-a-contract-value')
    for (const [i, v] of values.entries()) {
      expect(labels[i], `${v} has no label of its own`).not.toBe(unknown)
      expect(labels[i]!.length, `${v} labelled with nothing`).toBeGreaterThan(0)
    }
    // Two values that scope a charge differently must not read the same, or an
    // approver cannot tell a one-flat charge from a building-wide one.
    expect(new Set(labels).size, `labels collide: ${labels.join(' / ')}`).toBe(values.length)
  })

  it('never claims a scope it was not told', () => {
    // Every unrecognised input lands on the same hedged label, and that label
    // is not one of the specific claims. `null` included: a missing flat_set
    // is not evidence of a building-wide charge.
    const specific = contractFlatSets().map(flatSetLabel)
    for (const bad of [null, '', 'ALL', 'All', 'parkin', 'parking ', 'flats', 'everyone']) {
      expect(specific, `${JSON.stringify(bad)} read as a specific scope`).not.toContain(
        flatSetLabel(bad),
      )
      // Hedged, not absent. An empty string leaves a blank where the scope of
      // a charge should be, which reads as a rendering glitch rather than as
      // "we could not tell you" - and is not in `specific`, so the check above
      // passes on it.
      expect(flatSetLabel(bad).trim(), `${JSON.stringify(bad)} rendered blank`).not.toBe('')
    }
  })

  it('distinguishes one flat from every flat', () => {
    // The actual regression: these two are opposites, and the broken binary
    // check mapped `flat` onto the `all` label.
    expect(flatSetLabel('flat')).not.toBe(flatSetLabel('all'))
  })

  it('is case-sensitive rather than guessing', () => {
    // No normalising: the contract values are lowercase, and silently accepting
    // a variant would hide a backend sending something we do not understand.
    expect(flatSetLabel('PARKING')).toBe(flatSetLabel('cf-unknown'))
  })
})

describe('categoryLabel', () => {
  it('labels a known category from its own table', () => {
    expect(categoryLabel('lift')).toBe('Lift')
  })

  it('shows an unknown category rather than hiding or inventing one', () => {
    // Degrades to the value itself: an approver sees what the backend sent.
    expect(categoryLabel('borewell')).toBe('Borewell')
  })

  it('names a missing category instead of leaving a blank', () => {
    expect(categoryLabel(null)).toBe('Uncategorised')
    expect(categoryLabel('')).toBe('Uncategorised')
  })
})

/*
 * The four outcomes a `proposal_closed` entry can carry, read out of the
 * contract for the same reason as `flat_set`: a fifth closing added there
 * must fail this suite rather than silently read as "still waiting".
 *
 * The contract lists only the closings. `posted` and `open` come from
 * `cf.proposal_status`, which answers 'posted' when a posting exists and
 * 'open' when nothing has closed the proposal, so they are named here.
 */
const contractClosings = (): string[] => {
  const row = readFileSync(LEDGER, 'utf8')
    .split('\n')
    .find((l) => /^\|\s*\d+\s*\|\s*`outcome`\s*\|/.test(l))
  if (!row) throw new Error(`no proposal_closed outcome row in ${LEDGER}`)
  const values = [...row.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!).filter((v) => v !== 'outcome')
  if (values.length < 2) throw new Error(`outcome row does not list its values: ${row}`)
  return values
}

describe('writeOutcome', () => {
  it('reads the contract row, so this suite cannot go stale silently', () => {
    const values = contractClosings()
    // Not an assertion on the count - a fifth closing arriving is the point.
    expect(values.length).toBeGreaterThan(1)
    expect(new Set(values).size).toBe(values.length)
  })

  it('calls every closing the contract defines closed, never waiting', () => {
    // THE regression. `status === 'posted' ? done : waiting` told a committee
    // member a DECLINED proposal was out for votes.
    for (const v of contractClosings()) {
      expect(writeOutcome(v), `${v} did not read as a closing`).toBe('closed')
    }
  })

  it('knows every state the app parses, so none falls to the hedge', () => {
    // PROPOSAL_STATES is what rows.ts accepts off the wire. A state the app
    // will happily parse but cannot classify is a gap between the two.
    for (const v of PROPOSAL_STATES) {
      expect(writeOutcome(v), `${v} is parsed but not classified`).not.toBe('unknown')
    }
  })

  it('agrees with the contract about which states close a proposal', () => {
    // Neither list is derived from the other, so this catches drift in either
    // direction: a closing the contract has and the app does not parse, or an
    // app state that is neither posted, open, nor a contract closing.
    const closings = contractClosings()
    for (const v of closings) {
      expect(PROPOSAL_STATES as readonly string[], `${v} is not parsed`).toContain(v)
    }
    const classified = PROPOSAL_STATES.filter((v) => writeOutcome(v) === 'closed')
    expect([...classified].toSorted()).toEqual([...closings].toSorted())
  })

  it('separates posted from waiting', () => {
    expect(writeOutcome('posted')).toBe('posted')
    expect(writeOutcome('open')).toBe('open')
  })

  it('hedges an unrecognised status rather than claiming one', () => {
    // The write already happened. Reporting it as waiting would be a claim
    // about a vote that may not be pending; reporting it as posted would be a
    // claim about the ledger. Both are worse than saying we cannot tell.
    for (const bad of [null, undefined, '', 'POSTED', 'Posted', 'post', 'posted ', 'pending', 0, 1, true, {}, []]) {
      expect(writeOutcome(bad), `${JSON.stringify(bad)} classified as something`).toBe('unknown')
    }
  })

  it('never answers open for a status it does not recognise', () => {
    // Narrower than the case above and kept separate: of the four wrong
    // answers, "waiting for the others" is the one a person acts on - they
    // stop chasing approvals that are not coming.
    for (const bad of [null, '', 'declined_by_chair', 'cf-new-state']) {
      expect(writeOutcome(bad)).not.toBe('open')
    }
  })
})

/*
 * OPINION SEVERITY.
 *
 * `clean < qualified < adverse < disclaimer`, and a disclaimer is WORSE than
 * an adverse opinion. The order lived only in a doc comment and in the
 * incidental order of three array literals, and `opinionTone` - the function
 * that decides whether a resident sees a calm chip or a break - had no test
 * at all.
 *
 * The ranking is read out of the contract row, which states it as a sequence
 * ("in that order of severity"), so reordering it there fails here rather
 * than silently re-ranking the AGM headline.
 */
describe('opinion severity', () => {
  const ranked = (() => {
    const line = readFileSync(LEDGER, 'utf8').split('\n').find((l) => /^\|\s*\d+\s*\|\s*`opinion`/.test(l))
    if (!line) throw new Error('no `opinion` row in the contract')
    const vs = [...line.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!).filter((v) => v !== 'opinion')
    if (vs.length < 4) throw new Error(`the contract lists ${vs.length} opinions, not a ranking: ${line}`)
    return vs as Opinion[]
  })()

  it('ranks them in the order the contract states', () => {
    // Vacuity guard: if the row stops listing a sequence, the throw above
    // fires rather than this passing over a one-element list.
    expect(ranked.length).toBeGreaterThan(3)
    for (let i = 0; i < ranked.length; i++) {
      for (let j = 0; j < ranked.length; j++) {
        const expected = ranked[Math.max(i, j)]!
        expect(worseOpinion(ranked[i]!, ranked[j]!), `${ranked[i]} vs ${ranked[j]}`).toBe(expected)
      }
    }
  })

  it('puts a disclaimer above an adverse opinion, which is the easy one to invert', () => {
    // Stated separately because it is the pair a reader gets wrong: an
    // adverse opinion sounds worse than a refusal to give one.
    expect(worseOpinion('adverse', 'disclaimer')).toBe('disclaimer')
    expect(worseOpinion('disclaimer', 'adverse')).toBe('disclaimer')
  })

  it('is symmetric and idempotent, so argument order cannot change a headline', () => {
    for (const a of ranked) {
      expect(worseOpinion(a, a)).toBe(a)
      for (const b of ranked) expect(worseOpinion(a, b)).toBe(worseOpinion(b, a))
    }
  })

  it('headlines the most serious opinion ever received, not the most recent', () => {
    const worst = ranked[ranked.length - 1]!
    const best = ranked[0]!
    // The worst arrives first and the best last: a "most recent" rule would
    // return the best, which is the claim the product must never make.
    expect(headlineOpinion([worst, best])).toBe(worst)
    expect(headlineOpinion([best, worst])).toBe(worst)
    expect(headlineOpinion(ranked.toReversed())).toBe(worst)
  })

  it('has no headline for an empty history', () => {
    expect(headlineOpinion([])).toBeNull()
  })
})

describe('opinionTone', () => {
  it('reads clean as checked-against and everything worse as not', () => {
    expect(opinionTone('clean')).toBe('anchor')
    for (const o of ['qualified', 'adverse', 'disclaimer'] as Opinion[]) {
      expect(opinionTone(o), `${o} must not read as reassuring`).not.toBe('anchor')
    }
  })

  it('never gives an absent opinion the same tone as a clean one', () => {
    /* A recorded null means a closed year with no opinion - a gap in the
     * record, not a reassurance. It must not look like a clean audit. */
    expect(opinionTone(null)).not.toBe('anchor')
    expect(opinionTone(undefined)).not.toBe('anchor')
    expect(opinionTone(null)).not.toBe(opinionTone('clean'))
  })

  it('distinguishes a missing opinion from no year at all', () => {
    // null is a closed year whose opinion did not come through; undefined is
    // "nothing to show yet". Collapsing them hides the first case.
    expect(opinionTone(null)).not.toBe(opinionTone(undefined))
  })
})

describe('opinionChip', () => {
  it('never renders an empty chip for a closed year', () => {
    /* `opinionLabel[y.headline!]` was `undefined` here, so a SEALED year -
     * the most consequential state in the audit model - rendered a lock icon
     * beside no text at all, reading as nothing. */
    for (const o of [null, undefined]) {
      const s = opinionChip(o)
      expect(s.trim().length, 'an absent opinion rendered as blank').toBeGreaterThan(0)
    }
  })

  it('says the opinion is not recorded rather than naming one', () => {
    const absent = opinionChip(null)
    for (const o of ['clean', 'qualified', 'adverse', 'disclaimer'] as Opinion[]) {
      expect(absent, 'an absent opinion must not claim a specific one').not.toBe(opinionChip(o))
    }
  })

  it('names the opinion when there is one', () => {
    for (const o of ['clean', 'qualified', 'adverse', 'disclaimer'] as Opinion[]) {
      expect(opinionChip(o).toLowerCase()).toContain(o)
    }
  })
})
