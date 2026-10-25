import { describe, expect, it } from 'vitest'
import {
  complaints,
  formatPostedAt,
  pair,
  type Entry,
  type EntryStatus,
} from './ledger'

/*
 * ASSERT THE RULE, NEVER THE SAMPLE NUMBER.
 *
 * Every entry below is built by a helper so no test depends on a literal
 * amount, a literal id or a count. An assertion on `rows.length === 4` gets
 * "fixed" by editing the 4, which deletes the test's meaning while leaving
 * it green.
 */

let nextId = 1000

function entry(status: EntryStatus, over: Partial<Entry> = {}): Entry {
  const id = over.id ?? nextId++
  return {
    id,
    status,
    postedAt: '2026-10-24T14:32:00+05:30',
    description: 'Sample',
    counterparty: 'Sample counterparty',
    voucher: null,
    approvalRoute: 'Treasurer and secretary',
    amount: { minor: 650000, currency: 'INR' },
    balanceAfter: { minor: 1000000, currency: 'INR' },
    openFlags: 0,
    ...over,
  }
}

function reversalOf(original: Entry, over: Partial<Entry> = {}): Entry {
  return entry('reversal', {
    reverses: original.id,
    reversalReason: 'Duplicate payment to the same vendor.',
    ...over,
  })
}

describe('pair', () => {
  it('renders a reversed entry and its reversal as ONE row, not two', () => {
    const original = entry('reversed')
    const reversal = reversalOf(original)
    /* Newest first, which is how the ledger arrives. */
    const rows = pair([reversal, original])

    expect(
      rows.length,
      'the pair must collapse into a single variable-height item - two separate rows is the bug this module exists to prevent',
    ).toBe(1)
    const row = rows[0]!
    expect(row.kind).toBe('reversedPair')
    if (row.kind !== 'reversedPair') return
    expect(row.original.id).toBe(original.id)
    expect(row.reversal.id).toBe(reversal.id)
  })

  it('keeps every entry that went in, whether paired or not', () => {
    const plain = entry('verified')
    const original = entry('reversed')
    const reversal = reversalOf(original)
    const pending = entry('pending')

    const input = [pending, reversal, original, plain]
    const rows = pair(input)

    const emitted = new Set<number>()
    for (const row of rows) {
      if (row.kind === 'entry') emitted.add(row.entry.id)
      else {
        emitted.add(row.original.id)
        emitted.add(row.reversal.id)
      }
    }
    /*
     * The RELATIONSHIP, not a count: every input id appears exactly once
     * somewhere in the output. Pairing is a regrouping, never a filter -
     * dropping an entry would hide a record the chain exists to prove.
     */
    expect(emitted.size).toBe(input.length)
    for (const e of input) expect(emitted.has(e.id)).toBe(true)
  })

  it('shows an orphaned reversal rather than dropping it', () => {
    /* Its original is on an earlier page of history. */
    const orphan = entry('reversal', {
      reverses: 1,
      reversalReason: 'Original is outside this page.',
    })
    const rows = pair([orphan])

    expect(
      rows.length,
      'an orphaned reversal must still render: a short page is far likelier than a missing entry, and silently dropping it hides a correction',
    ).toBe(1)
    expect(rows[0]!.kind).toBe('entry')
  })

  it('shows an entry marked reversed whose reversal is absent', () => {
    const stranded = entry('reversed')
    const rows = pair([stranded])
    expect(rows.length).toBe(1)
    expect(rows[0]!.kind).toBe('entry')
  })

  it('emits the pair at the reversal position, not the original position', () => {
    const original = entry('reversed')
    const newer = entry('verified')
    const reversal = reversalOf(original)
    /* Newest first: newer, then the reversal, then the old original. */
    const rows = pair([newer, reversal, original])

    const index = rows.findIndex((r) => r.kind === 'reversedPair')
    const newerIndex = rows.findIndex(
      (r) => r.kind === 'entry' && r.entry.id === newer.id,
    )
    expect(
      index,
      'the correction happened at the reversal position in the chain, which is where its amount moved the balance',
    ).toBeGreaterThan(newerIndex)
  })

  it('does not pair a reversal that names no entry', () => {
    const malformed = entry('reversal')
    const rows = pair([malformed])
    expect(rows[0]!.kind).toBe('entry')
  })
})

describe('complaints', () => {
  it('reports an entry reversed more than once', () => {
    const original = entry('reversed')
    const first = reversalOf(original)
    const second = reversalOf(original)

    const found = complaints([second, first, original])
    expect(
      found.length,
      'an entry may be reversed at most once - this is what makes a reversed pair net to zero by construction instead of by special-casing',
    ).toBeGreaterThan(0)
    expect(found.some((c) => c.entryId === original.id)).toBe(true)
  })

  it('reports a reversal of a reversal', () => {
    const original = entry('reversed')
    const reversal = reversalOf(original)
    const second = reversalOf(reversal)

    const found = complaints([second, reversal, original])
    expect(
      found.some((c) => c.problem.includes('reversal of a reversal')),
      'a reversal that can itself be reversed makes the approval tier a laundering path',
    ).toBe(true)
  })

  it('reports a reversal with no reason, including a whitespace-only one', () => {
    const original = entry('reversed')

    /*
     * A MISSING field and a field explicitly set to undefined are different
     * shapes under exactOptionalPropertyTypes, and a backend can send
     * either. The absent case is built by deleting the key rather than
     * assigning undefined, so it is genuinely the absent shape.
     */
    const absent = { ...reversalOf(original) }
    delete (absent as { reversalReason?: string }).reversalReason
    expect(
      complaints([absent, original]).some((c) =>
        c.problem.includes('no stated reason'),
      ),
      'a reversal arriving with no reason field at all must be rejected',
    ).toBe(true)

    for (const reason of ['', '   ', '\n\t']) {
      const bad = reversalOf(original, { reversalReason: reason })
      const found = complaints([bad, original])
      expect(
        found.some((c) => c.problem.includes('no stated reason')),
        `a reason of ${JSON.stringify(reason)} must be rejected: the reason is mandatory, and whitespace satisfies a naive length check while telling a resident nothing`,
      ).toBe(true)
    }
  })

  it('stays silent on a well-formed chain', () => {
    const original = entry('reversed')
    const rows = [reversalOf(original), original, entry('verified')]
    expect(complaints(rows)).toHaveLength(0)
  })
})

describe('formatPostedAt', () => {
  it('returns null rather than rendering "Invalid Date" to a resident', () => {
    for (const bad of ['', 'yesterday', 'not-a-date', '2026-13-45']) {
      expect(
        formatPostedAt(bad),
        `${JSON.stringify(bad)} must produce null - "Invalid Date" would be printed verbatim beside a money figure`,
      ).toBeNull()
    }
  })

  it('separates date from time so each can be styled independently', () => {
    const out = formatPostedAt('2026-10-24T14:32:00+05:30')
    expect(out).not.toBeNull()
    /* Shape, not a literal string: the locale decides the wording. */
    expect(out!.date).not.toBe('')
    expect(out!.time).toMatch(/\d{1,2}:\d{2}/)
    expect(out!.date).not.toBe(out!.time)
  })
})
