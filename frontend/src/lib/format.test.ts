import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { approvalDiscloses, auditChip, categoryLabel, flatSetLabel, headlineOpinion, opinionChip, opinionTone, worseOpinion, writeOutcome } from './format'
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
const ranked: Opinion[] = (() => {
  const line = readFileSync(LEDGER, 'utf8').split('\n').find((l) => /^\|\s*\d+\s*\|\s*`opinion`/.test(l))
  if (!line) throw new Error('no `opinion` row in the contract')
  const vs = [...line.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!).filter((v) => v !== 'opinion')
  if (vs.length < 4) throw new Error(`the contract lists ${vs.length} opinions, not a ranking: ${line}`)
  return vs as Opinion[]
})()

describe('opinion severity', () => {
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

/*
 * THE SEAL, ACROSS BOTH SURFACES THAT RENDER IT.
 *
 * A closed year's chip was `tone={y.closed ? 'anchor' : 'neutral'}` with the
 * text "Year closed" on the committee screen - so a year closed with an
 * ADVERSE opinion, or with a DISCLAIMER, rendered in the reassuring tone with
 * the opinion shown nowhere on that screen. The row carried `headline` the
 * whole time; the chip ignored it.
 *
 * Asserted here as a property over the whole opinion domain rather than per
 * call site, because the same pair of expressions is rendered on two screens
 * and a third would otherwise reintroduce it.
 */
describe('a closed year reads as reassuring only when its opinion is clean', () => {
  // Every value the contract defines, plus the two absent cases a closed
  // year can actually hold.
  const states = [...ranked, null, undefined] as (Opinion | null | undefined)[]

  it('reserves the reassuring tone for a clean opinion alone', () => {
    for (const o of states) {
      const reassuring = opinionTone(o) === 'anchor'
      expect(reassuring, `${String(o)} must not read as reassuring`).toBe(o === 'clean')
    }
  })

  it('always names the seal, so no closed year renders a blank chip', () => {
    for (const o of states) {
      expect(opinionChip(o).trim().length, `${String(o)} rendered blank`).toBeGreaterThan(0)
    }
  })
})

/*
 * AN OPEN YEAR AND A CLOSED ONE ARE NOT THE SAME ABSENCE.
 *
 * `headline === null` was read as "Not yet audited" in the calm tone on the
 * resident-facing report whether or not the year was closed. Both readings
 * are wrong in opposite directions, and the fix is not a tone:
 *
 *   - on an OPEN year it is the ordinary state for most of the year, so
 *     warning about it trains residents to ignore the warning tone.
 *   - on a CLOSED year nothing further is pending, so "not yet" is a false
 *     reassurance about a gap in the record.
 *
 * `closed` sits beside `headline` in the report row, so the distinction was
 * available the whole time.
 */
describe('auditChip', () => {
  it('reads calm on an open year with no opinion, which is most of a year', () => {
    const open = auditChip(false, null)
    expect(open.tone).toBe('neutral')
    expect(open.text).toMatch(/not yet/i)
  })

  it('does not say "not yet" about a closed year, where nothing is pending', () => {
    const sealed = auditChip(true, null)
    expect(sealed.text).not.toMatch(/not yet/i)
    expect(sealed.text.trim().length).toBeGreaterThan(0)
    // A gap in the record on a sealed year is not reassuring, and not calm.
    expect(sealed.tone).not.toBe('anchor')
    expect(sealed.tone).not.toBe(auditChip(false, null).tone)
  })

  it('names the opinion when there is one, whatever the year state', () => {
    for (const closed of [true, false]) {
      for (const o of ranked) {
        const c = auditChip(closed, o)
        expect(c.text.toLowerCase(), `${o} was not named`).toContain(o)
        expect(c.tone, `${o} tone ignored the opinion`).toBe(opinionTone(o))
      }
    }
  })

  it('reserves the reassuring tone for a clean opinion, closed or not', () => {
    const states: (Opinion | null)[] = [...ranked, null]
    for (const closed of [true, false]) {
      for (const o of states) {
        expect(auditChip(closed, o).tone === 'anchor', `closed=${closed} ${String(o)}`).toBe(o === 'clean')
      }
    }
  })

  it('never returns a blank chip', () => {
    for (const closed of [true, false]) {
      for (const o of [...ranked, null] as (Opinion | null)[]) {
        expect(auditChip(closed, o).text.trim().length, `closed=${closed} ${String(o)}`).toBeGreaterThan(0)
      }
    }
  })
})

/** The quoted members of a one-line union declaration, sorted. Throws rather
 * than returning an empty list, so a renamed declaration fails loudly instead
 * of asserting over nothing. */
const readUnion = (file: string, decl: string) => {
  const src = readFileSync(resolve(__dirname, file), 'utf8')
  const line = src.split('\n').find((l) => l.includes(decl))
  if (!line) throw new Error(`no \`${decl}\` in ${file}`)
  const vs = [...line.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!)
  if (vs.length < 2) throw new Error(`${decl} in ${file} is not a union: ${line}`)
  return vs.toSorted()
}

/*
 * The Tone union is declared twice - here in lib/, which stays free of
 * component imports, and in ui.tsx, which owns the class for each. A tone
 * added there and not here cannot be asked for by auditChip; a tone removed
 * there resolves to NO class, so the chip renders unstyled and nothing fails.
 */
describe('the tone names lib/ may ask for match the ones ui.tsx can render', () => {
  it('declares the same set in both places', () => {
    const mine = readUnion('./format.ts', 'type Tone =')
    const theirs = readUnion('../components/ui.tsx', 'type Tone =')
    expect(mine).toEqual(theirs)
  })

  it('gives every tone ui.tsx renders an actual class', () => {
    // A tone in the union with no entry in toneClass renders unstyled.
    const ui = readFileSync(resolve(__dirname, '../components/ui.tsx'), 'utf8')
    for (const t of readUnion('../components/ui.tsx', 'type Tone =')) {
      expect(ui, `${t} has no class`).toMatch(new RegExp(`\\n\\s*${t}:\\s*'`))
    }
  })
})

/*
 * Approving `appoint_auditor` is the society's recorded authorisation to
 * publish that auditor's statement for the year - there is no separate
 * consent entry - so the approver has to be told before deciding. That makes
 * the question "which actions carry a consequence" a decision, which is why
 * it is a `Record` here and not a `switch` in the route.
 *
 * The union is read from types.ts rather than listed again. An action added
 * there fails this suite instead of silently getting no entry: the typecheck
 * catches a missing key, but `vitest` does not typecheck, so a suite that
 * only read the Record would pass on code that cannot compile.
 */
const ACTIONS = (() => {
  const src = readFileSync(resolve(__dirname, './types.ts'), 'utf8')
  const m = src.match(/export type Action =([\s\S]*?)\nexport /)
  if (!m) throw new Error('no `export type Action =` block in types.ts')
  const vs = [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!)
  if (vs.length < 2) throw new Error(`Action is not a union: ${m[1]}`)
  return vs.toSorted()
})()

describe('what approving a proposal discloses', () => {
  it('reads the real Action union, not a stale copy', () => {
    // The guard above is only as good as this list. If the regex stops
    // matching, every loop below iterates nothing and passes.
    expect(ACTIONS.length).toBeGreaterThanOrEqual(8)
    expect(ACTIONS).toContain('appoint_auditor')
  })

  it('covers every action, so a new one cannot ship without a decision', () => {
    expect(Object.keys(approvalDiscloses).toSorted()).toEqual(ACTIONS)
  })

  it('appointing an auditor discloses; the entry is a function', () => {
    expect(typeof approvalDiscloses.appoint_auditor).toBe('function')
  })

  it('says who, says the year, and says it is published to every member', () => {
    // The rule, not the sentence: an assertion on the exact copy gets
    // "fixed" by pasting the new wording in, which deletes the test's
    // meaning. What must survive a rewrite is that the approver is told
    // whose statement, for which year, and how widely it goes.
    const said = approvalDiscloses.appoint_auditor!('Asha Rao', '2025-26')
    expect(said).toContain('Asha Rao')
    expect(said).toContain('2025-26')
    expect(said).toMatch(/every member/i)
    expect(said).toMatch(/authoris|authoriz/i)
  })

  it('carries the subject through rather than hardcoding one', () => {
    // A template that ignored its arguments would pass every assertion
    // above if the sample happened to be in the literal.
    const a = approvalDiscloses.appoint_auditor!('Asha Rao', '2025-26')
    const b = approvalDiscloses.appoint_auditor!('B. Mehta', '2026-27')
    expect(b).not.toEqual(a)
    expect(b).toContain('B. Mehta')
    expect(b).toContain('2026-27')
    expect(b).not.toContain('Asha Rao')
    expect(b).not.toContain('2025-26')
  })

  it('discloses nothing for the actions that authorise nothing further', () => {
    // Approving an expense consents to the expense. If one of these ever
    // grows a consequence, it gets an entry and a line here - the point is
    // that the decision is explicit either way, never absent.
    for (const a of ACTIONS.filter((x) => x !== 'appoint_auditor')) {
      expect(approvalDiscloses[a as keyof typeof approvalDiscloses],
        `${a} grew a disclosure with no test`).toBeNull()
    }
  })

  it('the route renders the decision rather than making its own', () => {
    // The copy used to live in a switch in approvals.tsx, where no test
    // reaches it without mounting a router - which is why it was never
    // written. This asserts the route asks lib/ for the answer.
    const route = readFileSync(resolve(__dirname, '../routes/approvals.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(route).toMatch(/approvalDiscloses\[/)

    /*
     * And that it is rendered unconditionally, not behind `confirm`.
     *
     * The first version of this assertion searched for `confirm &&` near the
     * word "authoris" - which never appears in the route, because the copy
     * lives in format.ts. So it matched nothing and passed, and wrapping the
     * element in `{confirm && ...}` survived as a mutant. The needle has to
     * be the thing the route actually contains: the element itself.
     */
    const rendered = route.match(/<Disclosure\b[^/]*\/>/g) ?? []
    expect(rendered, 'approvals.tsx no longer renders <Disclosure />').toHaveLength(1)
    const at = route.indexOf(rendered[0]!)
    const before = route.slice(Math.max(0, at - 60), at)
    expect(before, 'the disclosure must not be gated behind the confirm step')
      .not.toMatch(/(confirm|open|expanded|show\w*)\s*(&&|\?)\s*$/)
  })
})
