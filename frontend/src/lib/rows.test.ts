/*
 * Tests for the row parsers. These assert RULES, never sample numbers: an
 * assertion on a particular amount gets "fixed" by editing the expected
 * value, which leaves the test green and meaningless.
 *
 * The rule under test throughout is the one the dues bug proved: a response
 * the compiler vouched for and nothing checked reaches a surface and is
 * believed. So each case asks either "does a contract violation fail here"
 * or "does an unreadable money cell survive to be disclosed".
 */
import { describe, expect, it } from 'vitest'
import { ShapeError } from './parse'
import {
  chargePreview, disputeRow, duesRow, duesRows, ledgerRow, limitEntries, proposalRow,
  resolvedHandle, seat, structuring, summary,
} from './rows'
import { countable } from './countable'

/* A row that satisfies duesRow, built field by field so a change to the read
 * model breaks this helper rather than silently weakening every test. */
const dues = (over: Record<string, unknown> = {}) => ({
  flat_id: 'f1', label: 'A-101', ordinal: 1, has_parking: true,
  charged_minor: 125000, paid_minor: 0, outstanding_minor: 125000, ...over,
})

describe('duesRow', () => {
  it('accepts the shape the contract promises', () => {
    expect(() => duesRow(dues(), 'row')).not.toThrow()
  })

  /*
   * The whole point of the module. A null amount must NOT fail the row -
   * failing it would blank the dues screen over one unreadable cell, which
   * is a worse outcome than disclosing the cell.
   */
  it('keeps a row whose amount could not be read', () => {
    const row = duesRow(dues({ outstanding_minor: null }), 'row')
    expect(row.outstanding_minor).toBeNull()
  })

  it('hands that unreadable amount to countable, which refuses it', () => {
    const row = duesRow(dues({ outstanding_minor: null }), 'row')
    expect(countable(row.outstanding_minor).readable).toBe(false)
  })

  /* A null amount is permitted; a wrong-SHAPED one is not. Without this the
   * parser would be an expensive no-op on exactly the fields that matter. */
  it.each([
    ['a float', 12.5],
    ['a string', '125000'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['past the safe-integer range', Number.MAX_SAFE_INTEGER + 1],
    ['a boolean', false],
  ])('rejects a money field that is %s', (_label, value) => {
    expect(() => duesRow(dues({ outstanding_minor: value }), 'row')).toThrow(ShapeError)
  })

  it('rejects a null where the contract guarantees a value', () => {
    expect(() => duesRow(dues({ label: null }), 'row')).toThrow(ShapeError)
  })

  it('names the field that failed, so the error can be acted on', () => {
    try {
      duesRow(dues({ label: null }), 'useDues[3]')
      expect.unreachable('a null label must throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ShapeError)
      expect((e as ShapeError).path).toContain('label')
      expect((e as ShapeError).path).toContain('useDues[3]')
    }
  })

  it('rejects a row that is not an object at all', () => {
    for (const bad of [null, undefined, 'row', 7, []]) {
      expect(() => duesRow(bad, 'row')).toThrow(ShapeError)
    }
  })

  /* An absent field and a null field are the same contract violation: a
   * response missing `label` must not produce a row with label undefined. */
  it('rejects a missing required field as firmly as a null one', () => {
    const { label: _label, ...without } = dues()
    expect(() => duesRow(without, 'row')).toThrow(ShapeError)
  })
})

describe('duesRows', () => {
  it('rejects the whole page when one row is malformed', () => {
    expect(() => duesRows([dues(), dues({ label: null })], 'page')).toThrow(ShapeError)
  })

  it('names which row failed, not just that one did', () => {
    try {
      duesRows([dues(), dues(), dues({ ordinal: 'third' })], 'page')
      expect.unreachable('a bad row must throw')
    } catch (e) {
      expect((e as ShapeError).path).toContain('[2]')
    }
  })

  it('rejects a response that is not a list', () => {
    expect(() => duesRows({ rows: [] }, 'page')).toThrow(ShapeError)
  })

  it('accepts an empty page, which is a real answer', () => {
    expect(duesRows([], 'page')).toEqual([])
  })
})

const ledger = (over: Record<string, unknown> = {}) => ({
  seq: 12, recorded_at: 1_700_000_000, fingerprint: 'ab12', effect: 'expense',
  origin_effect: 'expense', amount_minor: -125000, currency: 'INR', proposal_seq: 11,
  action: 'expense', proposed_by: 'p1', counterparty: 'Lift AMC', category: 'lift',
  narration: 'Quarterly AMC', business_date: '2026-10-01', flat_id: null, flat_set: null,
  tier: 'pair', required: 2, limit_minor: 2500000, reverses_seq: null, replaces_seq: null,
  reason: null, reversed_by_seq: null, is_cash: true, balance_minor: 400000, ...over,
})

describe('ledgerRow', () => {
  it('accepts the shape the contract promises', () => {
    expect(() => ledgerRow(ledger(), 'row')).not.toThrow()
  })

  /*
   * The server chooses the enum, so an unknown variant is a server the client
   * does not understand. Letting it through reaches a switch with no branch
   * for it and renders either nothing or another branch's copy - on a screen
   * whose job is saying whether money moved in or out.
   */
  it.each(['effect', 'origin_effect', 'action', 'tier'])(
    'rejects an unknown %s rather than rendering an unhandled case', (field) => {
      expect(() => ledgerRow(ledger({ [field]: 'something_new' }), 'row')).toThrow(ShapeError)
    },
  )

  it('rejects an enum that arrives as the right word in the wrong type', () => {
    expect(() => ledgerRow(ledger({ tier: ['pair'] }), 'row')).toThrow(ShapeError)
  })

  it('keeps an unreadable amount so the row can still be shown', () => {
    const row = ledgerRow(ledger({ amount_minor: null }), 'row')
    expect(countable(row.amount_minor).readable).toBe(false)
  })

  /* Nullable by contract: a non-cash charge has no counterparty, a
   * society-wide entry no flat. These must not fail. */
  it.each(['counterparty', 'category', 'flat_id', 'flat_set', 'reason', 'reverses_seq', 'replaces_seq', 'reversed_by_seq'])(
    'accepts a null %s, which the contract permits', (field) => {
      expect(() => ledgerRow(ledger({ [field]: null }), 'row')).not.toThrow()
    },
  )

  it('rejects a null fingerprint, which every entry must carry', () => {
    expect(() => ledgerRow(ledger({ fingerprint: null }), 'row')).toThrow(ShapeError)
  })
})

describe('limitEntries', () => {
  const opened = (over: Record<string, unknown> = {}) => ({
    sequence: 1, kind: 'society_opened', recorded_at: 1_700_000_000,
    body: { approval_limit_minor: 2500000, limit_minor: null }, ...over,
  })
  const change = (over: Record<string, unknown> = {}) => ({
    sequence: 9, kind: 'posting', recorded_at: 1_700_000_100,
    body: { approval_limit_minor: null, limit_minor: 5000000 }, ...over,
  })

  it('accepts a chain where each kind carries its own limit field', () => {
    expect(limitEntries([opened(), change()], 'useLimit')).toHaveLength(2)
  })

  /*
   * The rule 0006 exists for. Every approval must be checkable against the
   * limit that applied THEN, so an entry whose limit cannot be read makes the
   * tier unknowable. There is no safe default: zero would claim the strictest
   * tier was in force, any other number a laxer one. It has to fail.
   */
  it('rejects a society_opened whose approval limit is missing', () => {
    expect(() => limitEntries([opened({ body: { approval_limit_minor: null, limit_minor: null } })], 'useLimit'))
      .toThrow(ShapeError)
  })

  it('rejects a limit change whose new limit is missing', () => {
    expect(() => limitEntries([change({ body: { approval_limit_minor: 1, limit_minor: null } })], 'useLimit'))
      .toThrow(ShapeError)
  })

  /* Each kind is checked for ITS field: a limit posting carrying only the
   * opening field must not be accepted by reading the wrong one. */
  it('does not let one kind satisfy the check with the other kind\'s field', () => {
    expect(() => limitEntries([change({ body: { approval_limit_minor: 5000000, limit_minor: null } })], 'useLimit'))
      .toThrow(ShapeError)
    expect(() => limitEntries([opened({ body: { approval_limit_minor: null, limit_minor: 2500000 } })], 'useLimit'))
      .toThrow(ShapeError)
  })

  it('names the entry and the field a committee would have to look up', () => {
    try {
      limitEntries([opened(), change({ body: { approval_limit_minor: null, limit_minor: null } })], 'useLimit')
      expect.unreachable('a limitless limit entry must throw')
    } catch (e) {
      expect((e as ShapeError).path).toContain('[1]')
      expect((e as ShapeError).path).toContain('limit_minor')
    }
  })

  it('rejects a kind it has no rule for, rather than skipping the check', () => {
    expect(() => limitEntries([opened({ kind: 'proposal' })], 'useLimit')).toThrow(ShapeError)
  })
})

describe('summary', () => {
  const base = {
    balance_minor: 400000, entries: 42, head_seq: 42, as_of: 1_700_000_000, fy: '2026-27',
    months: [{ month: '2026-10', in_minor: 1, out_minor: 2, charged_minor: 3, entries: 4 }],
    fy_spend: [{ category: 'lift', amount_minor: 5 }],
    fy_spend_total_minor: 5, outstanding_minor: 125000, flats_outstanding: 7, flats: 120,
  }

  it('accepts the shape the contract promises', () => {
    expect(() => summary(base, 'useSummary')).not.toThrow()
  })

  /*
   * A computed count, unlike a stored cell, has no honest unreadable state:
   * the server either counted or it did not. A null reaching the dashboard
   * would render as a missing arrears figure, which reads as "none" - the
   * dues bug in another costume, and in the same dangerous direction.
   */
  it.each(['flats_outstanding', 'flats', 'balance_minor', 'outstanding_minor', 'fy_spend_total_minor'])(
    'rejects a null %s instead of showing a count nobody computed', (field) => {
      expect(() => summary({ ...base, [field]: null }, 'useSummary')).toThrow(ShapeError)
    },
  )

  it('rejects a malformed figure nested in the months array', () => {
    expect(() => summary({ ...base, months: [{ ...base.months[0], in_minor: null }] }, 'useSummary'))
      .toThrow(ShapeError)
  })

  it('names the nested path, not just the top-level field', () => {
    try {
      summary({ ...base, fy_spend: [{ category: 'lift', amount_minor: 'lots' }] }, 'useSummary')
      expect.unreachable('a string amount must throw')
    } catch (e) {
      expect((e as ShapeError).path).toContain('fy_spend')
      expect((e as ShapeError).path).toContain('amount_minor')
    }
  })
})

describe('the parsers that may answer null', () => {
  /* Null is the ANSWER here - an unknown handle - not a failure, so the
   * nullable wrapper has to be outside the object, and a present object must
   * still be checked in full. */
  it('accepts null for an unknown resident handle', () => {
    expect(resolvedHandle(null, 'resolveHandle')).toBeNull()
  })

  it('still checks every field of a handle that did resolve', () => {
    expect(() => resolvedHandle({ name: 'R', flat: 'A-101', kind: 'owner' }, 'resolveHandle'))
      .toThrow(ShapeError)
  })

  it('accepts an open tenure, where ended is genuinely null', () => {
    expect(() => resolvedHandle({ name: 'R', flat: 'A-101', kind: 'owner', ended: null }, 'resolveHandle'))
      .not.toThrow()
  })

  it('accepts null for a charge preview that could not be computed', () => {
    expect(chargePreview(null, 'previewCharge')).toBeNull()
  })

  /*
   * base_minor becomes a real posting against every flat. An unreadable one
   * must stop the preview rather than render blank next to a Post button.
   */
  it('rejects a charge preview whose per-flat amount could not be read', () => {
    expect(() => chargePreview(
      { flats: 120, base_minor: null, extra_flats: 3, remainder_labels: [] }, 'previewCharge',
    )).toThrow(ShapeError)
  })

  it('rejects remainder labels that are not strings', () => {
    expect(() => chargePreview(
      { flats: 120, base_minor: 1000, extra_flats: 1, remainder_labels: [101] }, 'previewCharge',
    )).toThrow(ShapeError)
  })
})

describe('the rest of the read models', () => {
  it('rejects a seat whose role is not a role this client knows', () => {
    expect(() => seat(
      { person_id: 'p1', role: 'chairman', derived: false, seated_seq: 2, unseated_seq: null }, 'row',
    )).toThrow(ShapeError)
  })

  it('accepts a seat that is still open, where unseated_seq is null', () => {
    expect(() => seat(
      { person_id: 'p1', role: 'treasurer', derived: false, seated_seq: 2, unseated_seq: null }, 'row',
    )).not.toThrow()
  })

  it('rejects a dispute scope outside the three the product defines', () => {
    expect(() => disputeRow({
      seq: 5, recorded_at: 1, handle: 'h', scope: 'everything', target_seqs: [],
      counterparty: null, period: null, text: 't', is_open: true, notes: [],
    }, 'row')).toThrow(ShapeError)
  })

  it('rejects a dispute note whose kind it has no copy for', () => {
    expect(() => disputeRow({
      seq: 5, recorded_at: 1, handle: 'h', scope: 'entries', target_seqs: [5],
      counterparty: null, period: null, text: 't', is_open: true,
      notes: [{ seq: 6, note: 'escalated', text: 'x', by: 'p1', by_author: false, recorded_at: 2 }],
    }, 'row')).toThrow(ShapeError)
  })

  it('rejects a proposal state outside the lifecycle', () => {
    const p = {
      seq: 3, recorded_at: 1, proposed_by: 'p1', action: 'expense', amount_minor: 100,
      currency: 'INR', counterparty: null, category: null, narration: 'n',
      business_date: '2026-10-01', flat_id: null, target_seq: null, reason: null,
      replacement_amount_minor: null, person: null, role: null, fy: null, flat_set: null,
      flat_count: 0, tier: 'pair', required: 2, seated: 11, limit_minor: 2500000,
      state: 'open', posted_seq: null, approvals: [], approve_count: 0, decline_count: 0,
    }
    expect(() => proposalRow(p, 'row')).not.toThrow()
    expect(() => proposalRow({ ...p, state: 'cancelled' }, 'row')).toThrow(ShapeError)
  })

  /*
   * A proposal's limit is the limit it was judged against, so it is required
   * even though other money fields are not. A null here would leave an
   * approval with no checkable tier.
   */
  it('rejects a proposal carrying no limit to have been judged against', () => {
    const p = {
      seq: 3, recorded_at: 1, proposed_by: 'p1', action: 'expense', amount_minor: 100,
      currency: 'INR', counterparty: null, category: null, narration: 'n',
      business_date: '2026-10-01', flat_id: null, target_seq: null, reason: null,
      replacement_amount_minor: null, person: null, role: null, fy: null, flat_set: null,
      flat_count: 0, tier: 'pair', required: 2, seated: 11, limit_minor: null,
      state: 'open', posted_seq: null, approvals: [], approve_count: 0, decline_count: 0,
    }
    expect(() => proposalRow(p, 'row')).toThrow(ShapeError)
  })

  /* A structuring finding is an aggregate the server computed to answer one
   * question. A null total makes the finding meaningless, not partial. */
  it('rejects a structuring total that could not be read', () => {
    expect(() => structuring({
      counterparty: 'X', total_minor: null, limit_minor: 2500000, first_date: '2026-10-01',
      last_date: '2026-10-20', window_days: 30, constituents: [1, 2],
    }, 'row')).toThrow(ShapeError)
  })

  it('rejects structuring constituents that are not sequence numbers', () => {
    expect(() => structuring({
      counterparty: 'X', total_minor: 1, limit_minor: 2, first_date: '2026-10-01',
      last_date: '2026-10-20', window_days: 30, constituents: ['1'],
    }, 'row')).toThrow(ShapeError)
  })
})

describe('what the parsers must not do', () => {
  /*
   * An unknown field is kept, not dropped. The backend adds columns ahead of
   * the frontend reading them, and a parser that stripped them would make
   * every such addition look like data loss while the response was correct.
   */
  it('passes through a field the contract has added and this client ignores', () => {
    const row = duesRow({ ...dues(), settled_on: '2026-10-20' }, 'row') as Record<string, unknown>
    expect(row.settled_on).toBe('2026-10-20')
  })

  /*
   * A parser must never report a figure the response did not contain, and an
   * ABSENT money column is not the same as one the server sent as null. A
   * dropped column means the query is wrong - a typo in a select list, a
   * renamed view - and every row would otherwise arrive as an honest-looking
   * null, disclosed on screen as "not available" forever. Nullable money
   * tolerates an explicit null and nothing else.
   */
  it('rejects an absent money column instead of reading it as no value', () => {
    const { outstanding_minor: _o, ...without } = dues()
    expect(() => duesRow(without, 'row')).toThrow(ShapeError)
  })

  it('still accepts a money column the server explicitly sent as null', () => {
    const row = duesRow(dues({ outstanding_minor: null }), 'row')
    expect(countable(row.outstanding_minor).readable).toBe(false)
  })

  it('never substitutes a number for one it could not read', () => {
    const row = duesRow(dues({ outstanding_minor: null }), 'row')
    expect(row.outstanding_minor).not.toBe(0)
    expect(row.outstanding_minor).toBeNull()
  })
})
