import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { initials, proposalTitle } from './format'
import type { Action, ProposalRow } from './types'

/*
 * WHAT A COMMITTEE MEMBER READS BEFORE APPROVING A MONEY MOVEMENT.
 *
 * `proposalTitle` is the heading on the approvals card and the dashboard's
 * to-do line - four call sites across `/approvals` and `/`. It is the only
 * sentence naming WHAT is being approved, and approval is the step that moves
 * the ledger. A title that silently reads "Seat a member" when a person IS
 * named, or that prints a raw narration for an action with its own wording,
 * asks for a signature on something the signer did not read.
 *
 * Nothing tested it. The suites covered `tierLabel`, `actionLabel` and the
 * opinion ranking beside it in the same file and stopped there.
 */

const base: ProposalRow = {
  seq: 1,
  recorded_at: 0,
  proposed_by: 'u_pres',
  action: 'expense',
  amount_minor: 125075,
  currency: 'INR',
  counterparty: 'Sharma Electricals',
  category: 'repairs',
  narration: 'Replace the lobby fan',
  business_date: '2026-11-01',
  flat_id: null,
  target_seq: null,
  reason: null,
  replacement_amount_minor: null,
  person: null,
  role: null,
  fy: null,
  flat_set: null,
  flat_count: 0,
  tier: 'pair',
  required: 2,
  seated: 11,
  limit_minor: 0,
  state: 'open',
  posted_seq: null,
  approvals: [],
  approve_count: 0,
  decline_count: 0,
}

const row = (over: Partial<ProposalRow>): ProposalRow => ({ ...base, ...over })
const NAMES = new Map([['p_meera', 'CA Meera Kulkarni']])

describe('proposalTitle names what is being approved', () => {
  /*
   * The enum is read from types.ts rather than written out here.
   *
   * `Action` has eight members and the switch handles five by name. A test
   * listing the actions it knows about passes forever after a ninth lands -
   * which is the defect shape already measured once in this project, where a
   * contract enum grew and a binary check rendered a new value as its
   * opposite. Reading the declaration means a new action fails THIS test
   * until someone decides what its title says.
   */
  /** Every `'member'` inside a source span, dropping any group that did not capture. */
  function quoted(span: string): string[] {
    return [...span.matchAll(/'([a-z_]+)'/g)].flatMap((m) => (m[1] ? [m[1]] : []))
  }

  const declared: string[] = (() => {
    const src = readFileSync(join(import.meta.dirname, 'types.ts'), 'utf8')
    const decl = /export type Action =([\s\S]*?)\nexport /.exec(src)
    if (!decl?.[1]) throw new Error('could not find the Action declaration in types.ts')
    return quoted(decl[1])
  })()

  it('reads every Action member from the declaration, not from a list here', () => {
    // Guards the extractor itself: a regex that silently matched nothing
    // would make every case below vacuous.
    expect(declared.length).toBeGreaterThanOrEqual(8)
    expect(declared).toContain('appoint_auditor')
    expect(declared).toContain('expense')
  })

  it('accounts for every action either by name or as a known fallback', () => {
    /*
     * The assertion a new enum member actually trips, and the reason the
     * others cannot.
     *
     * Every test below passes an unhandled action through `default`, which
     * returns the counterparty - a non-empty, entirely plausible string. So
     * "gives every action a non-empty title" is satisfied by the fallback,
     * and a ninth action rendering as its payee reads as working. Measured:
     * adding `budget_set` to the declaration left all 15 green.
     *
     * The money actions SHOULD fall through - an expense and a receipt are
     * described by their counterparty, and that is the default's whole
     * purpose. So the check is not "no fallback": it is that the fallback
     * covers only the members listed here. A new action is in neither set
     * and fails, until someone adds a case or records it as described by its
     * counterparty.
     */
    const FALLS_THROUGH = ['expense', 'receipt'] as const

    const src = readFileSync(join(import.meta.dirname, 'format.ts'), 'utf8')
    const body = /export function proposalTitle\(([\s\S]*?)\n}/.exec(src)
    if (!body?.[1]) throw new Error('could not find proposalTitle in format.ts')
    const named = [...body[1].matchAll(/case '([a-z_]+)':/g)].flatMap((m) => (m[1] ? [m[1]] : []))

    // The extractor must really have found the cases, or this is vacuous.
    expect(named).toContain('limit_change')
    expect(named.length).toBeGreaterThanOrEqual(6)

    const unaccounted = declared.filter(
      (a) => !named.includes(a) && !(FALLS_THROUGH as readonly string[]).includes(a),
    )
    expect(unaccounted).toEqual([])

    // And the reverse: a case for an action the contract dropped is dead
    // code that still reads as coverage.
    expect(named.filter((a) => !declared.includes(a))).toEqual([])
  })

  it('gives every declared action a non-empty title', () => {
    for (const action of declared) {
      const title = proposalTitle(row({ action: action as Action, person: 'p_meera' }), NAMES)
      expect(title, action).toBeTruthy()
      expect(title.trim(), action).not.toBe('')
    }
  })

  it('never shows a raw person id to a signer', () => {
    // The id is a database key. Rendering it is the "guessed name reads as
    // empty" failure inverted: the screen looks populated and says nothing.
    for (const action of declared) {
      const title = proposalTitle(row({ action: action as Action, person: 'p_meera' }), NAMES)
      expect(title, action).not.toContain('p_meera')
    }
  })

  it('names the person when the map knows them', () => {
    for (const action of ['seat_admin', 'unseat_admin', 'appoint_auditor'] as const) {
      expect(proposalTitle(row({ action, person: 'p_meera' }), NAMES)).toContain('Meera Kulkarni')
    }
  })

  it('falls back to a role word when the person is unknown or absent', () => {
    /*
     * The names map is a separate read from the proposals list, so it can
     * arrive later or miss a row. The fallback must still describe the
     * action - "Seat" alone, or "Seat undefined", is what an unguarded
     * template produces.
     */
    for (const person of [null, 'p_nobody']) {
      expect(proposalTitle(row({ action: 'seat_admin', person }), new Map())).toBe('Seat a member')
      expect(proposalTitle(row({ action: 'appoint_auditor', person }), new Map())).toBe('Appoint an auditor')
    }
  })

  it('distinguishes a reversal from the entry it reverses', () => {
    /*
     * A reversal and its original would otherwise carry the SAME title, and
     * the approvals list shows both. The decision being approved is "undo
     * this", which is not the decision the original asked for - and a
     * reversal needs at least the tier of its original, so confusing the two
     * is confusing which threshold applies.
     */
    const original = proposalTitle(row({ action: 'expense' }), NAMES)
    const reversal = proposalTitle(row({ action: 'reversal', target_seq: 1 }), NAMES)
    expect(reversal).not.toBe(original)
    expect(reversal.toLowerCase()).toContain('revers')
    expect(reversal).toContain('Sharma Electricals')
  })

  it('uses the narration for a charge, even when a counterparty is present', () => {
    /*
     * A charge is levied on flats, so the narration is the description and
     * `counterparty` is normally null - which is exactly why this case must
     * supply one. With `counterparty: null` the dedicated `case 'charge'` and
     * the `default` arm return the SAME string, so deleting the case leaves
     * every assertion green: measured, that mutant survived 14 of 14. The
     * two arms only disagree when both fields are set, so that is the row
     * the test has to use.
     */
    const title = proposalTitle(
      row({
        action: 'charge',
        counterparty: 'Sharma Electricals',
        narration: 'Maintenance, November 2026',
      }),
      NAMES,
    )
    expect(title).toBe('Maintenance, November 2026')
    expect(title).not.toContain('Sharma')
  })

  it('uses the narration for a charge that has no counterparty at all', () => {
    // The realistic row, kept alongside: either arm answers it correctly,
    // and the point here is that the heading is never empty.
    expect(
      proposalTitle(row({ action: 'charge', counterparty: null, narration: 'Maintenance, November 2026' }), NAMES),
    ).toBe('Maintenance, November 2026')
  })

  it('falls back to the narration when an expense has no counterparty', () => {
    expect(proposalTitle(row({ action: 'expense', counterparty: null }), NAMES)).toBe('Replace the lobby fan')
  })

  it('does not state an amount, which is shown as a formatted figure beside it', () => {
    /*
     * The frontend never computes money, and `money.ts` is the only
     * formatter. A title interpolating `amount_minor` would print
     * "125075" - the missing-x100 bug made visible, and unreadable besides.
     */
    for (const action of declared) {
      const title = proposalTitle(row({ action: action as Action, person: 'p_meera' }), NAMES)
      expect(title, action).not.toContain('125075')
    }
  })
})

describe('initials', () => {
  /*
   * Rendered inside an `aria-hidden` avatar, so this is decoration and never
   * the accessible name - it cannot mislead a screen reader. It still must
   * not throw, because `money.ts` throwing a RangeError on one bad row is how
   * a single value took a whole screen down.
   */
  it('takes the first letter of the first two words', () => {
    expect(initials('Meera Kulkarni')).toBe('MK')
    expect(initials('Priya R. Shah')).toBe('PR')
  })

  it('drops the CA honorific so the letters are the person, not the title', () => {
    // Every auditor in the contract's own wording carries it, so without
    // this strip every auditor avatar reads "CM" / "CR" - the honorific, not
    // the name, and identical across different people.
    expect(initials('CA Meera Kulkarni')).toBe('MK')
    expect(initials('CA Rohit Deshpande')).toBe('RD')
  })

  it('upper-cases a lower-case name', () => {
    expect(initials('meera kulkarni')).toBe('MK')
  })

  it('returns a string rather than throwing on a degenerate name', () => {
    /*
     * `w[0]` is undefined for an empty segment, which `join('')` renders as
     * nothing rather than the string "undefined". Asserting that explicitly:
     * a refactor to `.map((w) => w.charAt(0))` keeps this green, while one to
     * a template string would print "undefined" and only this case says so.
     */
    for (const name of ['', '   ', 'CA ', 'Meera']) {
      const out = initials(name)
      expect(typeof out, name).toBe('string')
      expect(out.toLowerCase(), name).not.toContain('undefined')
    }
  })

  it('never returns more than two letters', () => {
    // The avatar is a fixed 28px or 40px circle. A third letter overflows it
    // rather than wrapping.
    for (const name of ['Dr. A B C D', 'Meera Anjali Kulkarni Deshpande', 'CA A B C']) {
      expect(initials(name).length, name).toBeLessThanOrEqual(2)
    }
  })
})
