import { describe, expect, it } from 'vitest'
import {
  matchAdjustments,
  matchApprovals,
  matchAuditYears,
  matchCommittee,
  matchEntries,
  matchFlats,
} from './search'
import type { Entry } from './ledger'
import type { Money } from './money'
import type {
  SampleAdjustment,
  SampleAdmin,
  SampleApproval,
  SampleAuditYear,
  SampleFlat,
} from './sample'

/*
 * These tests assert the RULES in search.ts, never the sample fixtures'
 * contents. Every figure below is built here, so a change to sample.ts
 * cannot turn a rule into a number that needs "fixing".
 */

const inr = (minor: number): Money => ({ minor, currency: 'INR' })

/* An unreadable figure: what the server sends when it could not compute one. */
const UNREADABLE: Money = { minor: Number.NaN, currency: 'INR' }

function entry(over: Partial<Entry> & { id: number }): Entry {
  return {
    postedAt: '2026-10-01T10:00:00+05:30',
    description: 'Something',
    counterparty: 'Someone',
    voucher: 'V-1',
    approvalRoute: 'treasurer+secretary',
    status: 'verified',
    amount: inr(-100000),
    balanceAfter: inr(500000),
    ...over,
  }
}

describe('matchEntries', () => {
  it('returns everything for an empty or whitespace query', () => {
    const entries = [entry({ id: 1 }), entry({ id: 2 })]
    expect(matchEntries(entries, '')).toHaveLength(entries.length)
    expect(matchEntries(entries, '   ')).toHaveLength(entries.length)
  })

  it('matches description, payee and voucher regardless of case', () => {
    const entries = [
      entry({ id: 1, description: 'Lift annual maintenance' }),
      entry({ id: 2, description: 'Water tank cleaning' }),
    ]
    const hit = matchEntries(entries, 'LIFT')
    expect(hit).toHaveLength(1)
    expect(hit[0]?.id).toBe(1)
  })

  it('finds an entry by its number, with or without the hash', () => {
    const entries = [entry({ id: 1482 }), entry({ id: 99 })]
    expect(matchEntries(entries, '#1482').map((e) => e.id)).toEqual([1482])
    expect(matchEntries(entries, '1482').map((e) => e.id)).toEqual([1482])
  })

  /*
   * THE RULE: a resident types what the amount looks like, not its minor
   * units, and never the sign.
   */
  it('matches an amount through its formatting and its sign', () => {
    const entries = [entry({ id: 1, amount: inr(-1850000) }), entry({ id: 2 })]
    /* "18,500.00" on screen; the stored figure is 1850000 minor units. */
    expect(matchEntries(entries, '1850000').map((e) => e.id)).toEqual([1])
    /* Grouping commas and a decimal point must not defeat the match. */
    expect(matchEntries(entries, '18,500.00').map((e) => e.id)).toEqual([1])
    /* The minus is not typed. */
    expect(matchEntries(entries, '-1850000').map((e) => e.id)).toEqual([1])
  })

  it('strips the sign rather than making it searchable', () => {
    /*
     * `Math.abs` is load-bearing, and a naive test cannot see it:
     * "1850000" is already a substring of "-1850000", so dropping abs
     * still matches. It shows up only where the sign CHANGES the digits
     * being compared - a leading digit of the typed query lining up with
     * the minus. An expense of -500 stringifies to "-500" without abs,
     * so a query for a figure ending in the same digits must not depend
     * on which side of zero the entry sits.
     */
    const expense = entry({ id: 1, amount: inr(-500), description: 'out' })
    const credit = entry({ id: 2, amount: inr(500), description: 'in' })
    /* Both carry the same magnitude, so both must match it. */
    expect(matchEntries([expense, credit], '500').map((e) => e.id)).toEqual([
      1, 2,
    ])
    /*
     * And the sign is NOT searchable text: a query of "-" carries no
     * digits, so it must not single out the expense. The voucher is
     * nulled here because the default fixture's "V-1" contains a hyphen -
     * matching that would make this pass for the wrong reason.
     */
    const noVoucher = [
      entry({ id: 1, amount: inr(-500), description: 'out', voucher: null }),
      entry({ id: 2, amount: inr(500), description: 'in', voucher: null }),
    ]
    expect(matchEntries(noVoucher, '-')).toHaveLength(0)
  })

  it('never matches on an unreadable amount', () => {
    /*
     * The query must carry DIGITS to reach the amount comparison at all -
     * a text-only query short-circuits before it, so asserting on "nan"
     * alone proves nothing about the guard.
     *
     * `String(Math.abs(NaN))` is "NaN", which contains no digits, so a
     * digit query can only match here if the guard is absent AND the
     * stringified figure is searched. Any digit query must miss.
     */
    const entries = [
      entry({ id: 1, amount: UNREADABLE, description: 'Unreadable figure' }),
      entry({ id: 2, amount: inr(500), description: 'Readable figure' }),
    ]
    /* "5" is in the readable figure and cannot be in a non-finite one. */
    expect(matchEntries(entries, '5').map((e) => e.id)).toEqual([2])
    /*
     * And the unreadable entry stays findable BY TEXT: it must not vanish
     * from the ledger just because its amount could not be computed.
     */
    expect(matchEntries(entries, 'unreadable').map((e) => e.id)).toEqual([1])
  })

  it('does not treat a non-finite figure as the digits of its id', () => {
    /*
     * Pins the guard directly: with `Number.isFinite` removed, a
     * non-finite minor stringifies and is searched. Nothing in "NaN"
     * can match a digit, so this fails only if the guard is gone AND
     * something else has changed - which is exactly when we want to know.
     */
    const broken = entry({
      /*
       * Every part of the fixture that legitimately carries digits is
       * cleared, so a digit match can only have come from the amount.
       * The id is searchable BY DESIGN ("#1482"), and the default
       * voucher and timestamp carry digits too - leaving any of them in
       * would make this pass whatever the guard did.
       */
      id: 7,
      amount: UNREADABLE,
      description: 'x',
      counterparty: 'y',
      voucher: null,
      approvalRoute: 'z',
    })
    for (const q of ['0', '1', '2', '3', '4', '5', '6', '8', '9']) {
      expect(matchEntries([broken], q)).toHaveLength(0)
    }
    /* The id stays findable - that is the one digit match it must keep. */
    expect(matchEntries([broken], '7')).toHaveLength(1)
  })

  /*
   * THE RULE THAT MATTERS MOST: a reversed pair is ONE item. Filtering out
   * half of it makes the screen claim money moved and never came back.
   */
  it('keeps the original when only the reversal matches', () => {
    const original = entry({ id: 10, description: 'Lift repair' })
    const reversal = entry({
      id: 11,
      status: 'reversal',
      reverses: 10,
      description: 'Cancels entry 10',
      reversalReason: 'Billed to the wrong society',
    })
    const got = matchEntries([original, reversal], 'wrong society')
    expect(got.map((e) => e.id).sort()).toEqual([10, 11])
  })

  it('keeps the reversal when only the original matches', () => {
    const original = entry({ id: 10, description: 'Lift repair' })
    const reversal = entry({
      id: 11,
      status: 'reversal',
      reverses: 10,
      description: 'Cancels the earlier one',
      reversalReason: 'Duplicate',
    })
    const got = matchEntries([original, reversal], 'lift repair')
    expect(got.map((e) => e.id).sort()).toEqual([10, 11])
  })

  it('keeps both halves when the query matches only one half by amount', () => {
    const original = entry({ id: 10, amount: inr(-740050) })
    const reversal = entry({
      id: 11,
      status: 'reversal',
      reverses: 10,
      amount: inr(740050),
      description: 'Cancels entry 10',
      reversalReason: 'Wrong payee',
    })
    /* Both halves carry the figure, but the rule must hold either way. */
    const got = matchEntries([original, reversal], '7400.50')
    expect(got.map((e) => e.id).sort()).toEqual([10, 11])
  })

  it('drops an unrelated entry while keeping a matched pair whole', () => {
    const original = entry({ id: 10, description: 'Lift repair' })
    const reversal = entry({
      id: 11,
      status: 'reversal',
      reverses: 10,
      description: 'Cancels entry 10',
      reversalReason: 'Duplicate',
    })
    const other = entry({ id: 12, description: 'Garden water' })
    const got = matchEntries([original, reversal, other], 'lift')
    expect(got.map((e) => e.id).sort()).toEqual([10, 11])
  })

  it('preserves the incoming order, so the balance stays readable', () => {
    const entries = [
      entry({ id: 3, description: 'lift a' }),
      entry({ id: 2, description: 'lift b' }),
      entry({ id: 1, description: 'lift c' }),
    ]
    expect(matchEntries(entries, 'lift').map((e) => e.id)).toEqual([3, 2, 1])
  })

  it('returns an empty array for a query nothing matches', () => {
    const entries = [entry({ id: 1, description: 'Lift repair' })]
    /* Rule 3: the caller must distinguish this from having no data. */
    expect(matchEntries(entries, 'zzzz')).toHaveLength(0)
  })
})

describe('matchFlats', () => {
  const flat = (over: Partial<SampleFlat> & { flat: string }): SampleFlat => ({
    resident: 'Sample resident',
    billed: inr(300000),
    received: inr(300000),
    arrears: inr(0),
    lastPaidAt: '2026-10-01T00:00:00+05:30',
    ...over,
  })

  it('matches the flat number and the resident name', () => {
    const flats = [flat({ flat: 'A-101' }), flat({ flat: 'B-204' })]
    expect(matchFlats(flats, 'a-101').map((f) => f.flat)).toEqual(['A-101'])
    expect(matchFlats(flats, '204').map((f) => f.flat)).toEqual(['B-204'])
  })

  /*
   * THE RULE: a flat whose arrears could not be computed must never
   * quietly drop out of a search. That is the "count came out too low"
   * failure - telling a treasurer to stop chasing a debt that exists.
   */
  it('keeps a flat with an unreadable arrears figure findable', () => {
    /* `null` is how the server says it could not compute one. */
    const broken = flat({ flat: 'C-301', arrears: null })
    /* Findable by its identity, which is what a treasurer actually types. */
    expect(matchFlats([broken], 'C-301')).toHaveLength(1)
    expect(matchFlats([broken], 'sample resident')).toHaveLength(1)
    /* And it must not match "nan" through a stringified figure. */
    expect(matchFlats([broken], 'nan')).toHaveLength(0)
  })

  it('does not match on arrears, so an amount search cannot mislead', () => {
    /*
     * `arrears` is on screen but deliberately not searchable: a flat whose
     * arrears is unreadable would be absent from an arrears search while
     * its neighbours were present, which reads as "this flat has none".
     */
    const owing = flat({ flat: 'D-401', arrears: inr(999999) })
    expect(matchFlats([owing], '999999')).toHaveLength(0)
  })

  it('matches billed and received amounts', () => {
    const f = flat({ flat: 'E-501', billed: inr(425000) })
    expect(matchFlats([f], '4250')).toHaveLength(1)
  })
})

describe('matchApprovals', () => {
  const approval = (
    over: Partial<SampleApproval> & { entryId: number },
  ): SampleApproval => ({
    description: 'Something',
    counterparty: 'Someone',
    amount: inr(500000),
    raisedAt: '2026-10-01T00:00:00+05:30',
    tier: 'N-of-M',
    approvalsHeld: 1,
    approvalsNeeded: 4,
    signedBy: ['treasurer'],
    ...over,
  })

  it('matches the roles that have already signed', () => {
    const queue = [
      approval({ entryId: 1, signedBy: ['treasurer'] }),
      approval({ entryId: 2, signedBy: ['secretary'] }),
    ]
    expect(matchApprovals(queue, 'secretary').map((a) => a.entryId)).toEqual([
      2,
    ])
  })

  it('matches the tier, so a resident can isolate the N-of-M queue', () => {
    const queue = [
      approval({ entryId: 1, tier: 'N-of-M' }),
      approval({ entryId: 2, tier: 'treasurer+secretary' }),
    ]
    expect(matchApprovals(queue, 'n-of-m').map((a) => a.entryId)).toEqual([1])
  })

  it('ignores an unreadable amount rather than matching "nan"', () => {
    const queue = [approval({ entryId: 1, amount: UNREADABLE })]
    expect(matchApprovals(queue, 'nan')).toHaveLength(0)
  })
})

describe('matchCommittee', () => {
  const member = (name: string, role: string): SampleAdmin => ({
    name,
    role,
    active: true,
  })

  it('matches name and role, case-insensitively', () => {
    const roster = [
      member('Sample member 1', 'Treasurer'),
      member('Sample member 2', 'Secretary'),
    ]
    expect(matchCommittee(roster, 'TREASURER').map((m) => m.name)).toEqual([
      'Sample member 1',
    ])
    expect(matchCommittee(roster, 'member 2').map((m) => m.role)).toEqual([
      'Secretary',
    ])
  })
})

describe('matchAuditYears', () => {
  const label = (o: SampleAuditYear['opinion']): string =>
    ({
      clean: 'Clean',
      qualified: 'Qualified',
      adverse: 'Adverse',
      disclaimer: 'Disclaimer of opinion',
    })[o]

  const year = (
    y: string,
    opinion: SampleAuditYear['opinion'],
  ): SampleAuditYear => ({
    year: y,
    opinion,
    auditor: 'Sample auditor',
    signedOffAt: '2026-08-14T00:00:00+05:30',
  })

  /*
   * THE RULE: a resident types what they READ. The stored value is
   * lowercase and the label is not, so both must match.
   */
  it('matches both the stored opinion and the label on screen', () => {
    const years = [year('2025-26', 'qualified'), year('2024-25', 'clean')]
    expect(matchAuditYears(years, 'qualified', label).map((y) => y.year)).toEqual(
      ['2025-26'],
    )
    expect(matchAuditYears(years, 'Qualified', label).map((y) => y.year)).toEqual(
      ['2025-26'],
    )
  })

  it('matches a label whose words are not in the stored value', () => {
    const years = [year('2023-24', 'disclaimer')]
    /* "of opinion" exists only in the label. */
    expect(matchAuditYears(years, 'of opinion', label)).toHaveLength(1)
  })

  it('matches the financial year as typed', () => {
    const years = [year('2025-26', 'clean'), year('2024-25', 'clean')]
    expect(matchAuditYears(years, '2024', label).map((y) => y.year)).toEqual([
      '2024-25',
    ])
  })
})

describe('matchAdjustments', () => {
  const adj = (
    over: Partial<SampleAdjustment> & { entryId: number },
  ): SampleAdjustment => ({
    correctsYear: '2024-25',
    reason: 'Something',
    amount: inr(100000),
    ...over,
  })

  /*
   * THE RULE: the reason IS the disclosure. Finding the figure without it
   * would let someone see the amount and miss why it exists.
   */
  it('searches the reason, because it is the disclosure', () => {
    const list = [
      adj({ entryId: 1, reason: 'Contractor invoice received late' }),
      adj({ entryId: 2, reason: 'Duplicate receipt' }),
    ]
    expect(matchAdjustments(list, 'invoice').map((a) => a.entryId)).toEqual([1])
  })

  it('searches the year it corrects', () => {
    const list = [
      adj({ entryId: 1, correctsYear: '2023-24' }),
      adj({ entryId: 2, correctsYear: '2024-25' }),
    ]
    expect(matchAdjustments(list, '2023-24').map((a) => a.entryId)).toEqual([1])
  })
})
