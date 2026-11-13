import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ShapeError } from './parse'
import { disputeRow, ledgerRow, note, proposalRow, seat, year } from './rows'
import { PROPOSAL_STATES, ROLE_ORDER, type Role } from './types'

/*
 * ENUM DRIFT.
 *
 * rows.ts hand-copies ten value lists out of contracts/. Twice now a contract
 * enum has grown and no frontend file was touched, so nothing went red:
 * `flat_set` gained `flat` and a one-flat charge rendered as "Every flat", and
 * `cf.proposal_status` turned out to answer six values where two call sites
 * tested for one.
 *
 * Both were found by reading. This reads the contract instead, for every enum
 * a row parser accepts, and compares it against what the parser will actually
 * take. A value added to a contract row now fails here.
 *
 * The test drives the real ROW parser rather than the bare `oneOf`, which is
 * also why those are not exported: a test against the list alone would prove
 * the list matches the contract while a row wired to the WRONG list passed.
 */

const KINDS = resolve(__dirname, '../../../contracts/chain/kinds')
const LEDGER = resolve(KINDS, 'ledger.v1.md')

/*
 * The values in a contract table row, read out of its backticks.
 *
 * The row is found by its own field name, so renaming a field in the contract
 * makes this THROW rather than quietly return nothing - the vacuity check
 * `flat_set` needed. Values are everything in backticks after the field name,
 * which is how every enum row under kinds/ is written.
 */
function contractValues(file: string, field: string): string[] {
  const head = new RegExp(String.raw`^\|\s*\d+\s*\|\s*` + '`' + field + '`' + String.raw`\s*\|`)
  const rows = readFileSync(file, 'utf8').split('\n').filter((l) => head.test(l))
  if (rows.length === 0) throw new Error(`no \`${field}\` row in ${file}`)
  const values = rows
    .flatMap((r) => [...r.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!))
    .filter((v) => v !== field)
  if (values.length < 2) throw new Error(`\`${field}\` lists no value set in ${file}: ${rows[0]}`)
  return [...new Set(values)]
}

/** Does this parser accept the value, or reject it as off-contract? */
function accepts(run: (v: string) => void, v: string): boolean {
  try {
    run(v)
    return true
  } catch (e) {
    if (e instanceof ShapeError) return false
    throw e
  }
}

/* Minimal rows that satisfy each parser, so the value under test is the only
 * thing that can fail. Built field by field for the reason the dues helper in
 * rows.test.ts is: a read-model change must break the helper loudly. */
const approval = (over: Record<string, unknown> = {}) => ({
  seq: 2, person: 'p1', decision: 'approve', role: 'treasurer', derived: false,
  recorded_at: 0, signature: 's', key_seq: 1, ...over,
})
const proposal = (over: Record<string, unknown> = {}) => ({
  seq: 1, recorded_at: 0, proposed_by: 'p1', action: 'expense', amount_minor: 1, currency: 'INR',
  counterparty: null, category: null, narration: 'n', business_date: '2026-11-03',
  flat_id: null, target_seq: null, reason: null, replacement_amount_minor: null, person: null,
  role: null, fy: null, flat_set: null, flat_count: 0, tier: 'pair', required: 2, seated: 2,
  limit_minor: 0, state: 'open', posted_seq: null, approvals: [], approve_count: 0,
  decline_count: 0, ...over,
})
const dispute = (over: Record<string, unknown> = {}) => ({
  seq: 1, recorded_at: 0, handle: 'h', scope: 'entries', target_seqs: [1], counterparty: null,
  period: null, text: 't', is_open: true, notes: [], ...over,
})
const noteRow = (over: Record<string, unknown> = {}) => ({
  seq: 1, note: 'comment', text: 't', by: 'p1', by_author: false, recorded_at: 0, ...over,
})
const ledger = (over: Record<string, unknown> = {}) => ({
  seq: 1, recorded_at: 0, fingerprint: 'ab', effect: 'expense', origin_effect: 'expense',
  amount_minor: -1, currency: 'INR', proposal_seq: 1, action: 'expense', proposed_by: 'p1',
  counterparty: null, category: null, narration: 'n', business_date: '2026-11-03',
  flat_id: null, flat_set: null, tier: 'pair', required: 2, limit_minor: 0, reverses_seq: null,
  replaces_seq: null, reason: null, reversed_by_seq: null, is_cash: true, balance_minor: -1, ...over,
})
const seatRow = (over: Record<string, unknown> = {}) => ({
  person_id: 'p1', role: 'treasurer', derived: false, seated_seq: 1, unseated_seq: null, ...over,
})
const yearRow = (over: Record<string, unknown> = {}) => ({
  fy: '2026-27', starts: '2026-04-01', ends: '2027-03-31', ended: false, closed: false,
  headline: null, headline_seq: null, history: [], auditor: null, ...over,
})
const opinionEntry = (over: Record<string, unknown> = {}) => ({
  /* `appointment_seq` is required, not optional: it is the society's
   * authorisation to publish this statement, and the contract says never
   * null. A fixture omitting it is rejected, which is the point. */
  seq: 1, opinion: 'clean', statement: 's', auditor: 'CA A', appointment_seq: 9, recorded_at: 0, ...over,
})

/*
 * One case per enum: the field, the contract row it is defined in, and a
 * parser call that puts the value in that field.
 *
 * `exclude` is never a convenience. Each one records a filter applied before
 * the frontend ever sees the row, and names where that filter lives, so the
 * day the filter is widened this test is what notices.
 */
const ENUMS: {
  field: string
  file: string
  run: (v: string) => void
  exclude?: { values: string[]; because: string }
}[] = [
  {
    field: 'decision',
    file: LEDGER,
    run: (v) => proposalRow(proposal({ approvals: [approval({ decision: v })] }), 'r'),
  },
  { field: 'tier', file: LEDGER, run: (v) => proposalRow(proposal({ tier: v }), 'r') },
  { field: 'action', file: LEDGER, run: (v) => proposalRow(proposal({ action: v }), 'r') },
  { field: 'scope', file: LEDGER, run: (v) => disputeRow(dispute({ scope: v }), 'r') },
  {
    field: 'note',
    file: LEDGER,
    run: (v) => note(noteRow({ note: v }), 'r'),
  },
  {
    field: 'effect',
    file: LEDGER,
    run: (v) => ledgerRow(ledger({ effect: v, origin_effect: v }), 'r'),
    exclude: {
      values: ['limit', 'seat', 'unseat', 'auditor'],
      because:
        'The `ledger` view filters to the five cash-and-charge effects, in its ' +
        'own where clause, so a governance posting never reaches a row parser. ' +
        'Widen that filter and this fails, because the parser and the ledger ' +
        'surface would both need the new effect.',
    },
  },
  {
    field: 'seat_role',
    file: resolve(KINDS, 'society.v1.md'),
    run: (v) => seat(seatRow({ role: v }), 'r'),
  },
  {
    /* The headline opinion is the most serious one ever received, and the
     * severity order clean < qualified < adverse < disclaimer is the contract's
     * own words. A value the parser refuses blanks the AGM headline. */
    field: 'opinion',
    file: LEDGER,
    run: (v) => year(yearRow({ headline: v, history: [opinionEntry({ opinion: v })] }), 'r'),
  },
]

describe('enum drift against the contracts', () => {
  for (const e of ENUMS) {
    describe(`\`${e.field}\``, () => {
      it('is still a value set in the contract', () => {
        // Vacuity guard. If the row is renamed or reformatted out of its
        // backticks, contractValues throws rather than returning an empty list
        // that would make every assertion below pass over nothing.
        expect(contractValues(e.file, e.field).length).toBeGreaterThan(1)
      })

      it('accepts every value the contract defines', () => {
        const excluded = new Set(e.exclude?.values ?? [])
        const expected = contractValues(e.file, e.field).filter((v) => !excluded.has(v))
        expect(expected.length, 'everything was excluded; this proves nothing').toBeGreaterThan(1)
        for (const v of expected) {
          expect(accepts(e.run, v), `the contract allows \`${v}\` and the parser refuses it`).toBe(true)
        }
      })

      it('refuses a value the contract does not define', () => {
        // Without this the case above passes on a parser that accepts anything,
        // which is the vacuous shape - green, and guarding nothing.
        expect(accepts(e.run, 'cf_not_in_the_contract')).toBe(false)
      })

      if (e.exclude && e.exclude.values.length > 0) {
        const omitted = e.exclude.values
        it('still refuses the values deliberately left out', () => {
          for (const v of omitted) {
            expect(
              contractValues(e.file, e.field),
              `\`${v}\` is excluded here but is no longer in the contract`,
            ).toContain(v)
            expect(accepts(e.run, v), `\`${v}\` is excluded but the parser takes it`).toBe(false)
          }
        })
      }
    })
  }

  it('parses every proposal state the contract can produce', () => {
    // PROPOSAL_STATES is not one contract row: `posted` and `open` come from
    // cf.proposal_status, the rest from a proposal_closed outcome. The closings
    // are checked here; how each is CLASSIFIED is writeOutcome's own suite.
    for (const v of contractValues(LEDGER, 'outcome')) {
      expect(PROPOSAL_STATES as readonly string[], `\`${v}\` closes a proposal and is not parsed`).toContain(v)
      expect(accepts((x) => proposalRow(proposal({ state: x }), 'r'), v)).toBe(true)
    }
  })

  it('refuses a proposal state outside the set', () => {
    expect(accepts((x) => proposalRow(proposal({ state: x }), 'r'), 'cf_not_a_state')).toBe(false)
  })

  it('orders committee roles exactly as the contract states them', () => {
    /*
     * The contract's `roles` row says `Same order: president treasurer
     * secretary member`, and the committee screen sorts by
     * `ROLE_ORDER.indexOf(seat.role)`.
     *
     * `indexOf` returns **-1** for a role not in the list, which sorts that
     * member ABOVE the president instead of failing. `readonly Role[]` is
     * satisfied by a list missing an entry, so the compiler cannot catch it;
     * and asserting the array against a hand-written copy of itself would be
     * circular, the trap `tier.test.ts` fell into. So it is asserted against
     * the contract row - the document both sides are meant to follow.
     *
     * Order is compared, not membership: a set comparison passes on a
     * committee listed president-last, which is the whole point of the row.
     */
    const stated = contractValues(LEDGER, 'roles')
    expect(stated.length, 'the contract roles row lists no sequence').toBeGreaterThan(1)
    expect(
      [...ROLE_ORDER],
      'ROLE_ORDER must match the contract roles row, in order - indexOf returns -1 for a missing role and sorts it above the president',
    ).toEqual(stated)
  })

  it('gives every contract role a place in the order, so indexOf never returns -1', () => {
    // The assertion above would also pass if BOTH drifted together in the
     // same way; this one states the property the sort actually depends on.
    for (const r of contractValues(LEDGER, 'roles')) {
      expect(ROLE_ORDER.indexOf(r as Role), `\`${r}\` has no position in ROLE_ORDER`)
        .toBeGreaterThanOrEqual(0)
    }
  })
})
