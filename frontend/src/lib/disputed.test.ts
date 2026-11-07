import { describe, expect, it } from 'vitest'
import { disputedBy } from './disputed'
import type { DisputeRow, LedgerRow } from './types'

/*
 * The ledger's "disputed" filter decides which entries a resident is shown as
 * contested. It had no coverage while it lived in the route file, and the
 * payee half of the rule is the part a reimplementation drops: a dispute
 * naming a counterparty flags every entry to that payee, not only the ones it
 * cited.
 *
 * Nothing here asserts a count. Each case asserts which rows the predicate
 * claims and which it leaves alone.
 */
const dispute = (d: Partial<DisputeRow>): DisputeRow => ({
  seq: 1, recorded_at: 1, handle: 'h', scope: 'entries', target_seqs: [],
  counterparty: null, period: null, text: 't', is_open: true, notes: [],
  ...d,
})

const row = (r: Partial<LedgerRow>): LedgerRow => ({ seq: 1, counterparty: null, ...r } as LedgerRow)

describe('disputedBy', () => {
  it('claims nothing when there are no disputes', () => {
    for (const none of [undefined, []]) {
      const is = disputedBy(none)
      expect(is(row({ seq: 1 }))).toBe(false)
      expect(is(row({ seq: 1, counterparty: 'Sharma Plumbing' }))).toBe(false)
    }
  })

  it('claims an entry whose seq a dispute targets, and not its neighbours', () => {
    const is = disputedBy([dispute({ target_seqs: [41] })])
    expect(is(row({ seq: 41 }))).toBe(true)
    expect(is(row({ seq: 40 }))).toBe(false)
    expect(is(row({ seq: 42 }))).toBe(false)
  })

  it('claims EVERY entry to a disputed payee, not only the cited one', () => {
    // The rule the payee scope exists for. A dispute citing seq 7 against a
    // payee must flag the other payments to that payee too, or three of four
    // look clean.
    const is = disputedBy([dispute({ scope: 'counterparty', counterparty: 'Sharma Plumbing', target_seqs: [7] })])
    expect(is(row({ seq: 7, counterparty: 'Sharma Plumbing' }))).toBe(true)
    expect(is(row({ seq: 8, counterparty: 'Sharma Plumbing' }))).toBe(true)
    expect(is(row({ seq: 9, counterparty: 'Someone Else' }))).toBe(false)
  })

  it('matches a payee regardless of case on either side', () => {
    // Free text typed by whoever raised the dispute; a case-sensitive compare
    // would flag neither spelling.
    const is = disputedBy([dispute({ counterparty: 'Sharma Plumbing' })])
    for (const typed of ['sharma plumbing', 'SHARMA PLUMBING', 'Sharma Plumbing']) {
      expect(is(row({ seq: 1, counterparty: typed }))).toBe(true)
    }
  })

  it('does not treat a null counterparty as matching a disputed payee', () => {
    // A charge has no payee. It must not inherit a payee dispute, and the
    // Set must never be probed with null as though it were a name.
    const is = disputedBy([dispute({ counterparty: 'Sharma Plumbing' })])
    expect(is(row({ seq: 1, counterparty: null }))).toBe(false)
  })

  it('ignores a closed dispute, by seq and by payee', () => {
    // Resolved flags leave the count. The dispute stays in the entry's log;
    // this filter is the to-do list.
    const is = disputedBy([
      dispute({ is_open: false, target_seqs: [41], counterparty: 'Sharma Plumbing' }),
    ])
    expect(is(row({ seq: 41 }))).toBe(false)
    expect(is(row({ seq: 42, counterparty: 'Sharma Plumbing' }))).toBe(false)
  })

  it('still claims a row when one dispute is closed and another open one covers it', () => {
    // A closed dispute must not mask an open one over the same entry.
    const is = disputedBy([
      dispute({ seq: 1, is_open: false, target_seqs: [41] }),
      dispute({ seq: 2, is_open: true, target_seqs: [41] }),
    ])
    expect(is(row({ seq: 41 }))).toBe(true)
  })

  it('accumulates across several open disputes', () => {
    const is = disputedBy([
      dispute({ seq: 1, target_seqs: [10, 11] }),
      dispute({ seq: 2, counterparty: 'Vendor B' }),
    ])
    expect(is(row({ seq: 10 }))).toBe(true)
    expect(is(row({ seq: 11 }))).toBe(true)
    expect(is(row({ seq: 99, counterparty: 'Vendor B' }))).toBe(true)
    expect(is(row({ seq: 99, counterparty: 'Vendor C' }))).toBe(false)
  })
})
