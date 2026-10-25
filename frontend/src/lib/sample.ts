import type {
  AdjustingEntry,
  AllocationRemainder,
  AnchorStatus,
  ApprovalPolicy,
  AuditYear,
  CommitteeSeat,
  DashboardData,
  DuesRow,
  Entry,
  FlagLogItem,
  MatrixRow,
  PendingApproval,
  ReportSummary,
  SignoffPeriod,
  StructuringGroup,
} from './types'

/**
 * Sample data, standing in for endpoints that do not exist yet.
 *
 * ONE module on purpose: the cutover to real data is then a single
 * file to delete plus the imports that break, rather than a hunt for
 * literals scattered through components.
 *
 * Four test files DO import this module, and that is allowed only
 * because of WHAT they assert: invariants that must hold OF the fixture
 * (ids unique, one currency, every amount a safe integer), and derived
 * values cross-checked against a recomputation. None of them asserts a
 * literal taken from here. A test that hardcodes a number out of this
 * file asserts nothing, because the number can be edited to make the
 * test pass again - which deletes the test while leaving it green.
 *
 * The values are chosen to exercise the cases that are easy to get
 * wrong, not to look tidy:
 *
 *   - A reversed entry WITH its reversal, so the paired row renders on
 *     the dashboard and not only on the ledger.
 *   - The reversal itself, so the back-reference renders too.
 *   - An entry carrying open flags.
 *   - A lakh-scale balance, Rs 4,82,350, which is the realistic figure
 *     for a society of this size and exercises the Indian grouping
 *     (two digits, then two, then three) that a Western formatter gets
 *     wrong. The crore-scale WIDTH case is covered by money.test.ts,
 *     not here: a fixture inflated past what a society holds makes
 *     every screenshot taken from it misleading.
 */

const INR = 'INR'

export const SAMPLE_ENTRIES: readonly Entry[] = [
  {
    id: 'e-847',
    sequence: 847,
    postedAt: '2026-10-21T09:12:00+05:30',
    narration: 'Lift annual maintenance contract',
    payee: 'Omega Elevators Pvt Ltd',
    amount: { minor: 4250000, currency: INR },
    direction: 'out',
    state: 'posted',
    balanceAfter: { minor: 48235000, currency: INR },
    openFlagCount: 0,
    fingerprint: '7f3a9c21',
  },
  {
    id: 'e-846',
    sequence: 846,
    postedAt: '2026-10-19T18:40:00+05:30',
    narration: 'Maintenance collection, October, 112 flats',
    payee: 'Society collection account',
    amount: { minor: 12400000, currency: INR },
    direction: 'in',
    state: 'posted',
    balanceAfter: { minor: 52485000, currency: INR },
    // ONE, not two. This entry has two flags in SAMPLE_FLAG_LOG and f-2
    // carries a resolvedAt, and only unresolved flags count in the
    // figure shown to residents. The fixture said 2, which contradicted
    // the rule the code enforces and would have made a wrong badge look
    // correct in every screenshot and every manual check.
    openFlagCount: 1,
    fingerprint: 'b14e0d88',
  },
  {
    id: 'e-845',
    sequence: 845,
    postedAt: '2026-10-18T11:05:00+05:30',
    narration: 'Plumbing repair, B wing basement',
    payee: 'Shree Sai Plumbing',
    amount: { minor: 1250000, currency: INR },
    direction: 'out',
    state: 'reversed',
    balanceAfter: { minor: 40085000, currency: INR },
    reversedBy: {
      id: 'e-848',
      sequence: 848,
      postedAt: '2026-10-22T10:30:00+05:30',
    },
    reversalReason: 'Billed twice by the vendor; the second invoice was paid in error',
    openFlagCount: 0,
    fingerprint: '2c7b55f0',
  },
  {
    id: 'e-848',
    sequence: 848,
    postedAt: '2026-10-22T10:30:00+05:30',
    narration: 'Correction of duplicate plumbing payment',
    payee: 'Shree Sai Plumbing',
    amount: { minor: 1250000, currency: INR },
    direction: 'in',
    state: 'reversal',
    balanceAfter: { minor: 48235000, currency: INR },
    reverses: {
      id: 'e-845',
      sequence: 845,
      postedAt: '2026-10-18T11:05:00+05:30',
    },
    reversalReason: 'Billed twice by the vendor; the second invoice was paid in error',
    openFlagCount: 0,
    fingerprint: '9a01ef43',
  },
]

export const SAMPLE_DASHBOARD: DashboardData = {
  balance: { minor: 48235000, currency: INR },
  asOf: '2026-10-22T20:00:00+05:30',
  entryCount: 847,
  period: {
    label: 'This month',
    inflow: { minor: 12400000, currency: INR },
    outflow: { minor: 8645000, currency: INR },
  },
  attention: [
    {
      id: 'a-1',
      kind: 'approval',
      label: 'Approve: Shree Sai Plumbing, B wing tap replacement',
      amount: { minor: 1250000, currency: INR },
      href: '/approvals',
    },
    {
      id: 'a-2',
      kind: 'flag',
      label: 'A resident has asked about the October maintenance collection',
      href: '/disputes',
    },
  ],
  recent: SAMPLE_ENTRIES,
}

export const SAMPLE_ANCHOR: AnchorStatus = {
  lastComparedAt: '2026-10-21T19:04:00+05:30',
  publishedAt: '2026-10-22T06:00:00+05:30',
  publishedSource: 'the society GitHub record',
  state: 'match',
}

/*
 * A ledger long enough to cross VIRTUALIZE_THRESHOLD, so the
 * virtualized path is the one that actually renders in development.
 * Generated rather than written out: the point is the count and the
 * height variation, not the narrations.
 *
 * Sequence descends, newest first, which is the order the server
 * returns and the order the ledger reads in.
 */
const FILLER_NARRATIONS = [
  'Housekeeping staff wages',
  'Security agency monthly charge',
  'Common area electricity',
  'Water tanker, two trips',
  'Garden maintenance',
  'Borewell pump repair',
  'Diesel for generator',
  'Pest control, all wings',
  'Fire extinguisher refill',
  'Intercom line fault',
  'Terrace waterproofing advance',
  'Accounting software renewal',
] as const

const FILLER_PAYEES = [
  'Sparkle Facility Services',
  'Vigil Security Services',
  'MSEDCL',
  'Krishna Water Suppliers',
  'Green Thumb Garden Care',
  'Patil Borewell Works',
  'Nayan Fuel Station',
  'SafeHome Pest Control',
  'FireGuard Systems',
  'Suburban Telecom',
  'Arihant Waterproofing',
  'Ledgerly Software',
] as const

/*
 * The filler walks BACKWARDS in sequence (844, 843, 842 ...) because the
 * list renders newest-first, but a running balance only makes sense
 * walked FORWARDS. Mixing the two directions was the bug here: the loop
 * applied each delta in array order, so entry 844's balanceAfter was
 * computed from 845's rather than from 843's, and walking the chain in
 * sequence order showed the balance moving the wrong way at every step.
 *
 * Nothing threw. The figures just did not reconcile, on the one surface
 * where a resident is invited to check that they do — which is the whole
 * reason the running balance is on screen. Sample data that does not
 * add up trains everyone looking at it to stop adding it up.
 *
 * So the amounts are generated first, then the balance is accumulated
 * from the OLDEST entry forwards, and only then is the array reversed
 * into display order. The delta and the direction are decided in one
 * place, so they cannot disagree.
 */
function filler(): Entry[] {
  const OLDEST_SEQUENCE = 785
  const COUNT = 60

  // Oldest first: index 0 is sequence 785, index 59 is sequence 844.
  const planned = Array.from({ length: COUNT }, (_, ascending) => {
    // `i` is kept counting down from the newest so the amounts, dates
    // and narrations are byte-identical to before: this fix is about
    // the balance, and a screenshot of the ledger should not change.
    const i = COUNT - 1 - ascending
    return {
      i,
      sequence: OLDEST_SEQUENCE + ascending,
      // Varied, deterministic amounts: no randomness, so a snapshot or a
      // screenshot of this data is reproducible.
      amount: 150000 + ((i * 37_000) % 2_300_000),
      inbound: i % 9 === 0,
    }
  })

  /*
   * The opening balance is derived, not chosen, and the figure it is
   * derived from is the one the hand-written entries above actually
   * need.
   *
   * The oldest hand-written entry is e-845, which pays OUT Rs 12,500
   * and reports a balanceAfter of Rs 4,00,850. So the newest filler
   * entry (844) must leave the balance at Rs 4,00,850 + Rs 12,500, or
   * the step from 844 into 845 moves by zero while claiming to move by
   * the amount - which is what it did: both ended on the same figure
   * and the two halves of the fixture met at a seam that did not
   * reconcile.
   */
  const OLDEST_HANDWRITTEN_BALANCE = 40085000
  const OLDEST_HANDWRITTEN_OUTFLOW = 1250000
  const closingBalance =
    OLDEST_HANDWRITTEN_BALANCE + OLDEST_HANDWRITTEN_OUTFLOW
  const netChange = planned.reduce(
    (sum, p) => sum + (p.inbound ? p.amount : -p.amount),
    0,
  )
  let balance = closingBalance - netChange

  const ascendingEntries: Entry[] = []

  for (const { i, sequence, amount, inbound } of planned) {
    balance += inbound ? amount : -amount

    const index = i % FILLER_NARRATIONS.length
    ascendingEntries.push({
      id: `e-${sequence}`,
      sequence,
      // Dates walk backwards from the newest filler entry.
      postedAt: new Date(
        Date.UTC(2026, 9, 17, 6, 30) - i * 36 * 3600 * 1000,
      ).toISOString(),
      narration: FILLER_NARRATIONS[index] ?? 'Society expense',
      payee: FILLER_PAYEES[index] ?? 'Vendor',
      amount: { minor: amount, currency: INR },
      direction: inbound ? 'in' : 'out',
      state: 'posted',
      balanceAfter: { minor: balance, currency: INR },
      // One filler entry carries a question, so the flagged tab is not
      // empty in development.
      openFlagCount: i === 4 ? 1 : 0,
      fingerprint: (0x1000_0000 + sequence * 7919).toString(16).slice(0, 8),
    })
  }

  // Into display order. The balance was accumulated oldest-first; the
  // ledger reads newest-first.
  return ascendingEntries.reverse()
}

export const SAMPLE_LEDGER: readonly Entry[] = [
  ...SAMPLE_ENTRIES,
  ...filler(),
]

/**
 * Question logs, keyed by entry id. Both states present on one entry on
 * purpose: a resolved question must stay visible beside an open one, so
 * the surface that keeps them both is the one that gets exercised.
 */
export const SAMPLE_FLAG_LOG: Readonly<Record<string, readonly FlagLogItem[]>> =
  {
    'e-846': [
      {
        id: 'f-1',
        question:
          'The October collection shows 112 flats but we have 118. Which six have not paid?',
        raisedAt: '2026-10-20T08:15:00+05:30',
        authorHandle: 'Resident A-704',
      },
      {
        id: 'f-2',
        question: 'Is the amount per flat the same as September?',
        raisedAt: '2026-10-20T11:40:00+05:30',
        authorHandle: 'Resident C-102',
        resolvedAt: '2026-10-20T17:05:00+05:30',
        answer:
          'Yes, Rs 1,100 per flat, unchanged since April 2026. The AGM approved no revision this year.',
      },
    ],
    'e-840': [
      {
        id: 'f-3',
        question: 'Was a second quote taken for this?',
        raisedAt: '2026-10-11T19:20:00+05:30',
        authorHandle: 'Resident B-305',
      },
    ],
  }

export const SAMPLE_APPROVALS: readonly PendingApproval[] = [
  {
    id: 'p-1',
    narration: 'Terrace waterproofing, A wing',
    payee: 'Arihant Waterproofing',
    amount: { minor: 28500000, currency: INR },
    direction: 'out',
    raisedAt: '2026-10-22T11:00:00+05:30',
    raisedByHandle: 'Treasurer',
    // Above the limit, so the full committee vote applies.
    tier: 'n-of-m',
    approvedCount: 3,
    approvalsRequired: 9,
    viewerHasApproved: false,
    limitInForce: { minor: 5000000, currency: INR },
  },
  {
    id: 'p-2',
    narration: 'Tap replacement, B wing basement',
    payee: 'Shree Sai Plumbing',
    amount: { minor: 1250000, currency: INR },
    direction: 'out',
    raisedAt: '2026-10-22T09:25:00+05:30',
    raisedByHandle: 'Secretary',
    // At or below the limit: treasurer AND secretary, two people. Never
    // one.
    tier: 'both',
    approvedCount: 1,
    approvalsRequired: 2,
    viewerHasApproved: true,
    limitInForce: { minor: 5000000, currency: INR },
  },
]

/**
 * Three unsigned months, oldest first.
 *
 * Three, not one, and the order matters. The design's case is a society
 * where the president has not signed for three months: the dashboard
 * shows ONE item and the sign-off screen shows the oldest, because
 * listing three makes the oldest look equal to the newest. With a
 * single period in the sample that rule is unexercised — a bug that
 * rendered the whole list, or picked the newest, would look correct.
 *
 * The oldest is deliberately the awkward one: it carries both an
 * unanswered question and a structuring group, so the president's
 * "something should give you pause" path is what renders by default
 * rather than being reachable only by editing fixtures.
 */
export const SAMPLE_SIGNOFF: readonly SignoffPeriod[] = [
  {
    id: 's-2026-07',
    label: 'July 2026',
    inflow: { minor: 12640000, currency: INR },
    outflow: { minor: 11870000, currency: INR },
    entryCount: 41,
    openFlagCount: 2,
    structuring: [
      {
        payee: 'Krishna Water Suppliers',
        total: { minor: 6300000, currency: INR },
        windowDays: 30,
        entryIds: ['e-820', 'e-826', 'e-831'],
      },
    ],
  },
  {
    id: 's-2026-08',
    label: 'August 2026',
    inflow: { minor: 12710000, currency: INR },
    outflow: { minor: 8940000, currency: INR },
    entryCount: 35,
    openFlagCount: 0,
    structuring: [],
  },
  {
    id: 's-2026-09',
    label: 'September 2026',
    inflow: { minor: 12980000, currency: INR },
    outflow: { minor: 9120000, currency: INR },
    entryCount: 38,
    openFlagCount: 1,
    structuring: [],
  },
]

export const SAMPLE_DUES: readonly DuesRow[] = [
  {
    flat: 'A-101',
    billed: { minor: 330000, currency: INR },
    paid: { minor: 330000, currency: INR },
    outstanding: { minor: 0, currency: INR },
    asOf: '2026-10-22T20:00:00+05:30',
  },
  {
    flat: 'A-704',
    billed: { minor: 330000, currency: INR },
    paid: { minor: 110000, currency: INR },
    outstanding: { minor: 220000, currency: INR },
    asOf: '2026-10-22T20:00:00+05:30',
  },
  {
    flat: 'B-305',
    billed: { minor: 330000, currency: INR },
    paid: { minor: 0, currency: INR },
    outstanding: { minor: 330000, currency: INR },
    asOf: '2026-10-22T20:00:00+05:30',
  },
  {
    flat: 'C-102',
    billed: { minor: 330000, currency: INR },
    paid: { minor: 330000, currency: INR },
    outstanding: { minor: 0, currency: INR },
    asOf: '2026-10-22T20:00:00+05:30',
  },
]

export const SAMPLE_REPORTS: readonly ReportSummary[] = [
  {
    id: 'r-agm-2026',
    label: 'Annual general meeting report',
    periodLabel: '2025-26',
    generatedAt: '2026-09-30T10:00:00+05:30',
    kind: 'agm',
  },
  {
    id: 'r-period-2026-09',
    label: 'Monthly statement',
    periodLabel: 'September 2026',
    generatedAt: '2026-10-02T08:00:00+05:30',
    kind: 'period',
  },
  {
    id: 'r-audit-2025',
    label: 'Audited accounts',
    periodLabel: '2024-25',
    generatedAt: '2025-11-14T16:30:00+05:30',
    kind: 'audit',
  },
]

export const SAMPLE_AUDIT_YEARS: readonly AuditYear[] = [
  // Open: no closedAt, no opinion. A date is not a close; only an
  // auditor's sign-off is.
  { year: '2026-27' },
  {
    year: '2025-26',
    closedAt: '2026-09-18T00:00:00+05:30',
    opinion: 'qualified',
    opinionNote:
      'Vendor invoices for two payments in January 2026 were not available for inspection.',
  },
  {
    year: '2024-25',
    closedAt: '2025-11-14T00:00:00+05:30',
    opinion: 'clean',
  },
]

export const SAMPLE_ADJUSTING: readonly AdjustingEntry[] = [
  {
    entryId: 'e-848',
    correctsYear: '2025-26',
    amount: { minor: 1250000, currency: INR },
    reason: 'Billed twice by the vendor; the second invoice was paid in error',
    postedAt: '2026-10-22T10:30:00+05:30',
  },
]

/*
 * ELEVEN SEATS. Bye-law 113 puts a managing committee at 11-13 for a
 * society this size, so 11 is the real low end rather than a round
 * number chosen for arithmetic. It also makes the threshold
 * interesting: ceil(2 x 11 / 3) = 8, which is not 7 and not a half.
 *
 * One seat is RESTRICTED and one is VACANT on purpose. Nine seats can
 * sign against a threshold of eight, so the committee is one
 * restriction away from being unable to act at all - the case the
 * roster exists to make visible, sitting just on the safe side of the
 * line rather than comfortably clear of it.
 */
export const SAMPLE_COMMITTEE: readonly CommitteeSeat[] = [
  { seat: 1, holderHandle: 'Treasurer', office: 'Treasurer', status: 'active' },
  { seat: 2, holderHandle: 'Secretary', office: 'Secretary', status: 'active' },
  { seat: 3, holderHandle: 'President', office: 'President', status: 'active' },
  { seat: 4, holderHandle: 'Member 4', status: 'active' },
  { seat: 5, holderHandle: 'Member 5', status: 'active' },
  { seat: 6, holderHandle: 'Member 6', status: 'active' },
  { seat: 7, holderHandle: 'Member 7', status: 'active' },
  { seat: 8, holderHandle: 'Member 8', status: 'active' },
  { seat: 9, holderHandle: 'Member 9', status: 'active' },
  {
    seat: 10,
    holderHandle: 'Member 10',
    status: 'restricted',
    restrictionReason:
      'Co-opted after a resignation. Cannot approve until the next general body meeting confirms the appointment.',
  },
  { seat: 11, status: 'vacant' },
]

/*
 * The limit is ZERO, which makes every expense N-of-M.
 *
 * That is 0004's safe default and it is what a society starts with
 * before it votes on a limit. The approvals fixture carries its own
 * `limitInForce` values because those are snapshots from when each
 * entry was raised - they are deliberately NOT this number, which is
 * the whole point of snapshotting.
 */
export const SAMPLE_POLICY: ApprovalPolicy = {
  seats: 11,
  quorumRequired: 8,
  limit: { minor: 0, currency: INR },
}

/*
 * Three payments to one contractor inside a fortnight, each below the
 * limit that applied then, together above it. The ordinary shape of a
 * repair billed in stages - which is exactly why the notice is worded
 * as a disclosure rather than an accusation.
 */
export const SAMPLE_STRUCTURING: readonly StructuringGroup[] = [
  {
    payee: 'Omkar Lift Services',
    total: { minor: 4250000, currency: INR },
    windowDays: 10,
    entryIds: ['e-811', 'e-818', 'e-826'],
  },
]

/*
 * A remainder that does not divide: 2 minor units across 112 flats.
 * Chosen because 112 is the fixture's flat count and the leftover is
 * smaller than the number of flats, which is the normal case and the
 * one where "who got the extra paisa" is a real question.
 */
export const SAMPLE_ALLOCATION: AllocationRemainder = {
  total: { minor: 6720000, currency: INR },
  flatCount: 112,
  remainderMinor: 2,
  carriedBy: ['A-103', 'B-404'],
}

/*
 * Five flats, covering every state the matrix must render: paid in
 * full, part-paid, nothing paid, a tenant (liability differs), and one
 * well past due.
 *
 * `outstanding` is NOT billed - paid in any of these rows by
 * coincidence of arithmetic; it is supplied as its own figure because
 * the server computes it. A test that recomputed it here would be
 * asserting the fixture is self-consistent, which is true and useless.
 */
export const SAMPLE_MATRIX: readonly MatrixRow[] = [
  {
    flat: 'A-101',
    tenancy: 'owner',
    billed: { minor: 600000, currency: INR },
    paid: { minor: 600000, currency: INR },
    outstanding: { minor: 0, currency: INR },
  },
  {
    flat: 'A-102',
    tenancy: 'owner',
    billed: { minor: 600000, currency: INR },
    paid: { minor: 250000, currency: INR },
    outstanding: { minor: 350000, currency: INR },
    overdueDays: 12,
  },
  {
    flat: 'A-103',
    tenancy: 'tenant',
    billed: { minor: 600000, currency: INR },
    paid: { minor: 600000, currency: INR },
    outstanding: { minor: 0, currency: INR },
  },
  {
    flat: 'B-201',
    tenancy: 'owner',
    billed: { minor: 600000, currency: INR },
    paid: { minor: 0, currency: INR },
    outstanding: { minor: 600000, currency: INR },
    overdueDays: 3,
  },
  {
    flat: 'B-302',
    tenancy: 'owner',
    billed: { minor: 1800000, currency: INR },
    paid: { minor: 0, currency: INR },
    outstanding: { minor: 1800000, currency: INR },
    overdueDays: 47,
  },
]
