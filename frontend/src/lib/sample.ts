/*
 * SAMPLE DATA. NONE OF THIS IS REAL, AND IT MUST NEVER BE MISTAKEN FOR REAL.
 *
 * The backend is a separate lane, so every screen here has structure and no
 * live data. Six empty screens cannot be judged for density, column widths
 * or whether a reversed pair reads correctly, so this file fills them.
 *
 * TWO RULES MAKE THAT SAFE, and both are load-bearing:
 *
 * 1. EVERY VALUE IS SELF-EVIDENTLY FAKE. Flats are A-101, payees are
 *    "Sample Lifts Pvt Ltd", the society is "Sample Greens CHS". Nobody
 *    reading a screenshot has to be told these are not a real society's
 *    accounts - the words say so. Amounts are realistic in SHAPE (a lift
 *    AMC costs more than a water tanker) because that is the whole point
 *    of having them, but they are round numbers, not audited figures.
 *
 * 2. NO FINGERPRINTS. There is not one hash, chain head or signature in
 *    this file, and none may be added. A fabricated 64-character hex string
 *    is INDISTINGUISHABLE from a real one, and the record-check screen
 *    exists to be shown at an AGM. Every other value announces itself as
 *    sample on sight; a hash cannot. Those slots stay empty and say they
 *    are waiting on the server.
 *
 * Amounts follow the money rule exactly: integer minor units plus an ISO
 * 4217 code, and the sign is stated here rather than derived. The running
 * balances were computed once, by hand, away from the browser - this file
 * is data, and `money.ts` still does no arithmetic.
 *
 * WIRING: `SAMPLE_DATA_ON` is the single switch, read once per screen.
 * When the backend lands, flip it to `false`, confirm every screen falls
 * back to its `AwaitingData` state, then delete this file and the banner.
 */
import type { Entry } from './ledger'
import type { Money } from './money'

/*
 * THE SWITCH. One constant, so removing sample data is one edit and a
 * typecheck, not a hunt through six routes.
 */
export const SAMPLE_DATA_ON = true

const INR = (minor: number): Money => ({ minor, currency: 'INR' })

/* The fictional society every screen names. "Sample" is in the name. */
export const SAMPLE_SOCIETY = 'Sample Greens CHS'

/*
 * A page of ledger history, newest first - the order the server sends and
 * the order `pair()` expects.
 *
 * It deliberately contains the awkward cases rather than twelve clean rows,
 * because the clean row is the one case that was never in doubt:
 *
 *   - a reversed entry and its reversal (#1486 reverses #1479)
 *   - an entry with unresolved resident flags (#1483)
 *   - an entry still awaiting its approvals (#1488)
 *   - both directions of money: receipts positive, expenses negative
 *   - a missing voucher, which is a real and common state
 *
 * `balanceAfter` is null on the reversed entry and on its reversal. That is
 * not missing data - it is `pair()`'s contract: a reversed pair nets to
 * zero, so printing a running balance against either half would show a
 * figure that never stood.
 */
export const SAMPLE_ENTRIES: readonly Entry[] = [
  {
    id: 1488,
    status: 'pending',
    postedAt: '2026-10-24T11:20:00+05:30',
    description: 'Terrace waterproofing - first instalment',
    counterparty: 'Sample Waterproofing Co',
    voucher: 'SMP/2026/0412',
    approvalRoute: 'Above limit: awaiting 9 of 13',
    amount: INR(-18500000),
    balanceAfter: null,
    openFlags: 0,
  },
  {
    id: 1487,
    status: 'verified',
    postedAt: '2026-10-22T09:05:00+05:30',
    description: 'Maintenance receipts - October, 94 flats',
    counterparty: '94 flats',
    voucher: 'SMP/2026/0411',
    approvalRoute: 'At or below limit: treasurer and secretary',
    amount: INR(4653000),
    balanceAfter: INR(28741550),
    openFlags: 0,
  },
  {
    id: 1486,
    status: 'reversal',
    postedAt: '2026-10-21T16:40:00+05:30',
    description: 'Reversal of entry #1479',
    counterparty: 'Sample Lifts Pvt Ltd',
    voucher: 'SMP/2026/0410',
    approvalRoute: 'Above limit: 9 of 13',
    amount: INR(2750000),
    balanceAfter: null,
    openFlags: 0,
    reverses: 1479,
    reversalReason:
      'Paid twice. The October AMC instalment was settled by cheque on 4 October and again by transfer on 18 October. This entry cancels the second payment; the vendor has confirmed the credit in writing.',
  },
  {
    id: 1485,
    status: 'verified',
    postedAt: '2026-10-20T14:15:00+05:30',
    description: 'Housekeeping wages - October',
    counterparty: 'Sample Facility Services',
    voucher: 'SMP/2026/0409',
    approvalRoute: 'At or below limit: treasurer and secretary',
    amount: INR(-6800000),
    balanceAfter: INR(24088550),
    openFlags: 0,
  },
  {
    id: 1484,
    status: 'verified',
    postedAt: '2026-10-18T10:00:00+05:30',
    description: 'Electricity - common areas and pumps',
    counterparty: 'State Electricity Board (sample)',
    voucher: 'SMP/2026/0408',
    approvalRoute: 'At or below limit: treasurer and secretary',
    amount: INR(-4235000),
    balanceAfter: INR(30888550),
    openFlags: 0,
  },
  {
    id: 1483,
    status: 'verified',
    postedAt: '2026-10-15T17:30:00+05:30',
    description: 'Garden re-turfing and plant replacement',
    counterparty: 'Sample Landscapes',
    voucher: null,
    approvalRoute: 'Above limit: 9 of 13',
    amount: INR(-9150000),
    balanceAfter: INR(35123550),
    /* Two residents have queried this one. Both still open. */
    openFlags: 2,
  },
  {
    id: 1482,
    status: 'verified',
    postedAt: '2026-10-12T12:00:00+05:30',
    description: 'Interest credited - fixed deposit',
    counterparty: 'Sample Co-op Bank',
    voucher: 'SMP/2026/0407',
    approvalRoute: 'At or below limit: treasurer and secretary',
    amount: INR(1842500),
    balanceAfter: INR(44273550),
    openFlags: 0,
  },
  {
    id: 1481,
    status: 'verified',
    postedAt: '2026-10-09T15:45:00+05:30',
    description: 'Security agency - October deployment',
    counterparty: 'Sample Security Services',
    voucher: 'SMP/2026/0406',
    approvalRoute: 'At or below limit: treasurer and secretary',
    amount: INR(-11200000),
    balanceAfter: INR(42431050),
    openFlags: 0,
  },
  {
    id: 1480,
    status: 'verified',
    postedAt: '2026-10-06T11:10:00+05:30',
    description: 'Water tanker - supplementary supply',
    counterparty: 'Sample Water Suppliers',
    voucher: 'SMP/2026/0405',
    approvalRoute: 'At or below limit: treasurer and secretary',
    amount: INR(-2400000),
    balanceAfter: INR(53631050),
    openFlags: 0,
  },
  {
    /* Reversed by #1486 above. Stays visible, struck through, forever. */
    id: 1479,
    status: 'reversed',
    postedAt: '2026-10-04T13:25:00+05:30',
    description: 'Lift AMC - October instalment',
    counterparty: 'Sample Lifts Pvt Ltd',
    voucher: 'SMP/2026/0404',
    approvalRoute: 'Above limit: 9 of 13',
    amount: INR(-2750000),
    balanceAfter: null,
    openFlags: 0,
  },
  {
    id: 1478,
    status: 'verified',
    postedAt: '2026-10-02T09:30:00+05:30',
    description: 'Maintenance receipts - September arrears, 7 flats',
    counterparty: '7 flats',
    voucher: 'SMP/2026/0403',
    approvalRoute: 'At or below limit: treasurer and secretary',
    amount: INR(346500),
    balanceAfter: INR(56031050),
    openFlags: 0,
  },
  {
    id: 1477,
    status: 'verified',
    postedAt: '2026-09-30T18:00:00+05:30',
    description: 'Annual audit fee - FY 2025-26',
    counterparty: 'Sample and Associates, Chartered Accountants',
    voucher: 'SMP/2026/0402',
    approvalRoute: 'Above limit: 9 of 13',
    amount: INR(-5900000),
    balanceAfter: INR(55684550),
    openFlags: 0,
  },
]

/* The balance after the newest entry that actually moved it (#1487). */
export const SAMPLE_BALANCE = INR(28741550)

/* The date that balance last moved, for the header's "as at" line. */
export const SAMPLE_BALANCE_AS_AT = '2026-10-22T09:05:00+05:30'

/* ------------------------------------------------------------------ */

/* The approval queue: what is waiting, and on whom. */
export interface SampleApproval {
  readonly entryId: number
  readonly description: string
  readonly counterparty: string
  readonly amount: Money
  readonly raisedAt: string
  /* The tier this amount falls into, in the committee's own words. */
  readonly tier: string
  readonly approvalsHeld: number
  readonly approvalsNeeded: number
  /* Roles that have signed, so the queue says who it is waiting on. */
  readonly signedBy: readonly string[]
}

export const SAMPLE_APPROVALS: readonly SampleApproval[] = [
  {
    entryId: 1488,
    description: 'Terrace waterproofing - first instalment',
    counterparty: 'Sample Waterproofing Co',
    amount: INR(-18500000),
    raisedAt: '2026-10-24T11:20:00+05:30',
    tier: 'Above the limit',
    approvalsHeld: 3,
    approvalsNeeded: 9,
    signedBy: ['Treasurer', 'Secretary', 'Chairperson'],
  },
  {
    entryId: 1489,
    description: 'Fire extinguisher refilling - all wings',
    counterparty: 'Sample Fire Safety',
    amount: INR(-4750000),
    raisedAt: '2026-10-24T15:50:00+05:30',
    tier: 'At or below the limit',
    approvalsHeld: 1,
    approvalsNeeded: 2,
    signedBy: ['Treasurer'],
  },
  {
    entryId: 1490,
    description: 'Revision of the approval limit',
    counterparty: 'Managing committee',
    amount: INR(10000000),
    raisedAt: '2026-10-25T08:15:00+05:30',
    /* Setting the limit is always N-of-M, whatever the amount. */
    tier: 'Above the limit: changing the limit itself',
    approvalsHeld: 2,
    approvalsNeeded: 9,
    signedBy: ['Chairperson', 'Secretary'],
  },
]

/* ------------------------------------------------------------------ */

/* A flat's maintenance standing. */
export interface SampleFlat {
  readonly flat: string
  readonly resident: string
  readonly billed: Money
  readonly received: Money
  /*
   * `null` where the server could not compute an arrears figure. This case
   * is in the sample ON PURPOSE: a surface that decides from a raw figure
   * must partition three ways - owing, clear, and unreadable - and the
   * unreadable case has to be visible in development to stay handled.
   */
  readonly arrears: Money | null
  readonly lastPaidAt: string | null
}

export const SAMPLE_FLATS: readonly SampleFlat[] = [
  {
    flat: 'A-101',
    resident: 'Sample resident 1',
    billed: INR(495000),
    received: INR(495000),
    arrears: INR(0),
    lastPaidAt: '2026-10-07T00:00:00+05:30',
  },
  {
    flat: 'A-102',
    resident: 'Sample resident 2',
    billed: INR(495000),
    received: INR(495000),
    arrears: INR(0),
    lastPaidAt: '2026-10-03T00:00:00+05:30',
  },
  {
    flat: 'A-103',
    resident: 'Sample resident 3',
    billed: INR(495000),
    received: INR(247500),
    arrears: INR(247500),
    lastPaidAt: '2026-09-28T00:00:00+05:30',
  },
  {
    flat: 'A-104',
    resident: 'Sample resident 4',
    billed: INR(495000),
    received: INR(0),
    arrears: INR(990000),
    lastPaidAt: '2026-08-11T00:00:00+05:30',
  },
  {
    flat: 'A-201',
    resident: 'Sample resident 5',
    billed: INR(562500),
    received: INR(562500),
    arrears: INR(0),
    lastPaidAt: '2026-10-05T00:00:00+05:30',
  },
  {
    flat: 'A-202',
    resident: 'Sample resident 6',
    billed: INR(562500),
    received: INR(562500),
    arrears: INR(0),
    lastPaidAt: '2026-10-02T00:00:00+05:30',
  },
  {
    flat: 'A-203',
    resident: 'Sample resident 7',
    billed: INR(562500),
    received: INR(0),
    arrears: INR(1687500),
    lastPaidAt: '2026-07-19T00:00:00+05:30',
  },
  {
    flat: 'A-204',
    resident: 'Sample resident 8',
    billed: INR(562500),
    received: INR(562500),
    arrears: INR(0),
    lastPaidAt: '2026-10-09T00:00:00+05:30',
  },
  {
    flat: 'B-101',
    resident: 'Sample resident 9',
    billed: INR(495000),
    received: INR(495000),
    arrears: INR(0),
    lastPaidAt: '2026-10-04T00:00:00+05:30',
  },
  {
    flat: 'B-102',
    resident: 'Sample resident 10',
    billed: INR(495000),
    received: INR(495000),
    arrears: INR(0),
    lastPaidAt: '2026-10-06T00:00:00+05:30',
  },
  {
    flat: 'B-103',
    resident: 'Sample resident 11',
    billed: INR(495000),
    received: INR(371250),
    arrears: INR(123750),
    lastPaidAt: '2026-10-01T00:00:00+05:30',
  },
  {
    /* The unreadable case. The matrix must disclose it, not count it clear. */
    flat: 'B-104',
    resident: 'Sample resident 12',
    billed: INR(495000),
    received: INR(495000),
    arrears: null,
    lastPaidAt: null,
  },
  {
    flat: 'B-201',
    resident: 'Sample resident 13',
    billed: INR(562500),
    received: INR(562500),
    arrears: INR(0),
    lastPaidAt: '2026-10-08T00:00:00+05:30',
  },
  {
    flat: 'B-202',
    resident: 'Sample resident 14',
    billed: INR(562500),
    received: INR(562500),
    arrears: INR(0),
    lastPaidAt: '2026-10-03T00:00:00+05:30',
  },
  {
    flat: 'B-203',
    resident: 'Sample resident 15',
    billed: INR(562500),
    received: INR(281250),
    arrears: INR(281250),
    lastPaidAt: '2026-09-30T00:00:00+05:30',
  },
  {
    flat: 'B-204',
    resident: 'Sample resident 16',
    billed: INR(562500),
    received: INR(562500),
    arrears: INR(0),
    lastPaidAt: '2026-10-11T00:00:00+05:30',
  },
]

/* ------------------------------------------------------------------ */

/*
 * The committee. Thirteen members, which is the statutory size for a
 * society of this scale under bye-law 113 - not a number chosen to fit the
 * layout.
 */
export interface SampleAdmin {
  readonly name: string
  readonly role: string
  /* Whether this member's approval is currently reachable. */
  readonly active: boolean
}

export const SAMPLE_COMMITTEE: readonly SampleAdmin[] = [
  { name: 'Sample member 1', role: 'Chairperson', active: true },
  { name: 'Sample member 2', role: 'Secretary', active: true },
  { name: 'Sample member 3', role: 'Treasurer', active: true },
  { name: 'Sample member 4', role: 'Committee member', active: true },
  { name: 'Sample member 5', role: 'Committee member', active: true },
  { name: 'Sample member 6', role: 'Committee member', active: true },
  { name: 'Sample member 7', role: 'Committee member', active: true },
  { name: 'Sample member 8', role: 'Committee member', active: true },
  { name: 'Sample member 9', role: 'Committee member', active: false },
  { name: 'Sample member 10', role: 'Committee member', active: true },
  { name: 'Sample member 11', role: 'Committee member', active: true },
  { name: 'Sample member 12', role: 'Committee member', active: true },
  { name: 'Sample member 13', role: 'Committee member', active: true },
]

/*
 * The approval limit in force, and the tiers it creates.
 *
 * `atOrBelowNeeds` is always exactly two - treasurer and secretary, both -
 * and never one. `aboveNeeds` is ceil(2 x 13 / 3) = 9, the floor in code.
 */
export const SAMPLE_LIMIT = {
  limit: INR(5000000),
  atOrBelowNeeds: 2,
  aboveNeeds: 9,
  committeeSize: 13,
  setAt: '2026-04-18T00:00:00+05:30',
} as const

/* ------------------------------------------------------------------ */

/* The audit trail: one row per financial year the society has closed. */
export interface SampleAuditYear {
  readonly year: string
  readonly opinion: 'clean' | 'qualified' | 'adverse' | 'disclaimer'
  readonly auditor: string
  readonly signedOffAt: string
}

export const SAMPLE_AUDIT_YEARS: readonly SampleAuditYear[] = [
  {
    year: '2024-25',
    opinion: 'clean',
    auditor: 'Sample and Associates',
    signedOffAt: '2025-08-14T00:00:00+05:30',
  },
  {
    /*
     * A qualified year is in the sample deliberately. The headline shows
     * the MOST SERIOUS opinion ever received, and a sample where every
     * year is clean never exercises that rule.
     */
    year: '2023-24',
    opinion: 'qualified',
    auditor: 'Sample and Associates',
    signedOffAt: '2024-08-29T00:00:00+05:30',
  },
  {
    year: '2022-23',
    opinion: 'clean',
    auditor: 'Sample and Associates',
    signedOffAt: '2023-09-02T00:00:00+05:30',
  },
]

/*
 * Entries posted in the current year that correct a CLOSED one. Each must
 * be disclosed at the AGM by entry, year, amount and reason - the report
 * generates this section so it cannot be left out.
 */
export interface SampleAdjustment {
  readonly entryId: number
  readonly correctsYear: string
  readonly amount: Money
  readonly reason: string
}

export const SAMPLE_ADJUSTMENTS: readonly SampleAdjustment[] = [
  {
    entryId: 1486,
    correctsYear: '2025-26',
    amount: INR(2750000),
    reason:
      'A lift AMC instalment was paid twice in the closed year. The reversal posts in the current period as an adjusting entry, because reversing inside an audited period would invalidate a filed report.',
  },
]

/* Resident flags. Only UNRESOLVED ones count in the figure shown. */
export const SAMPLE_OPEN_FLAGS = 2
export const SAMPLE_RESOLVED_FLAGS = 7

/* ------------------------------------------------------------------ */

/*
 * OPINION SEVERITY, and why this is a function rather than a sort.
 *
 * The statutory order is clean < qualified < adverse < disclaimer. A
 * DISCLAIMER IS THE MOST SERIOUS of the four, which is the opposite of
 * what the word suggests - an auditor who could not form an opinion at
 * all is a worse outcome than one who formed a bad one.
 *
 * Alphabetical order would put adverse first and clean second, and a
 * "latest year" headline would hide a qualified year behind two clean
 * ones. Both are the same bug: the headline must be the most serious
 * opinion EVER received.
 */
const OPINION_RANK = {
  clean: 0,
  qualified: 1,
  adverse: 2,
  disclaimer: 3,
} as const

const OPINION_LABEL = {
  clean: 'Clean',
  qualified: 'Qualified',
  adverse: 'Adverse',
  disclaimer: 'Disclaimer',
} as const

export function opinionLabel(opinion: SampleAuditYear['opinion']): string {
  return OPINION_LABEL[opinion]
}

/*
 * The most serious opinion in the list, or null when the list is empty.
 * Null rather than 'Clean': a society with no audited years has not been
 * given a clean opinion, and defaulting to one would be a claim.
 */
export function mostSeriousOpinion(
  years: readonly SampleAuditYear[],
): { readonly year: string; readonly opinionLabel: string } | null {
  let worst: SampleAuditYear | null = null
  for (const y of years) {
    if (worst === null || OPINION_RANK[y.opinion] > OPINION_RANK[worst.opinion]) {
      worst = y
    }
  }
  if (worst === null) return null
  return { year: worst.year, opinionLabel: OPINION_LABEL[worst.opinion] }
}
