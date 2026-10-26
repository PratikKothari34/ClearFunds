/*
 * One parser per read model, built from parse.ts. These are the shapes
 * contracts/api/v1.md promises; a response that does not match one is a
 * failed query, not a half-trusted object handed to a surface.
 *
 * `required` vs `nullable` is the load-bearing distinction here, and it is a
 * claim about the contract rather than a guess at the data:
 *   - required: the view types it nullable - they all are, every Postgres
 *     view column is - and the read model guarantees a value. A null is a
 *     contract violation and must surface.
 *   - nullable: genuinely absent sometimes, and every surface downstream
 *     already has to handle it. types.ts is the record of which is which.
 *
 * MONEY IS DELIBERATELY NOT `required`, even where the contract says never
 * null. A money field that failed the whole query would blank a screen over
 * one unreadable figure, which is the outcome countable.ts exists to prevent:
 * the row parses, and the surface discloses the figure it could not read. A
 * wrong-SHAPED money value is still rejected, because nullable(int) refuses a
 * float, a string and NaN - it permits exactly null.
 *
 * ENUMS ARE CHECKED because the server chooses the value. An unknown variant
 * reaching a switch with no branch for it renders nothing, or worse renders
 * the wrong branch's copy. Rejecting it names the field instead.
 *
 * Where the contract is silent on a field, this file follows types.ts, which
 * is the frontend's existing record of the read models. Any field marked
 * required here that is legitimately null will fail its query loudly rather
 * than show a wrong number - the safe direction, and a one-word fix.
 *
 * The four money cells were checked against the migrations and the contract
 * now states they are never null: ledger shows only postings that move money,
 * balance_minor is a running sum, limit_minor is required in the proposal
 * layout, and outstanding_minor is coalesced. They stay `nullable` anyway.
 * The contract saying a value is never null is a statement about a correct
 * server, and this parser's job is the incorrect one - a server fault here
 * discloses one unreadable figure instead of blanking the screen, which is
 * the whole point of countable.ts.
 */
import { array, bool, int, nullable, object, oneOf, required, ShapeError, str } from './parse'
import type { Parser } from './parse'
import type {
  Approval, ChargePreview, DisputeRow, DuesRow, LedgerRow, Note, Person, ProposalRow, Report,
  LimitEntry, ResolvedHandle, Seat, SignoffEntry, Structuring, Summary, Year,
} from './types'

/* Shared vocabularies, kept together so a backend addition is one edit here
 * rather than a hunt through the file. */
const role = oneOf(['president', 'treasurer', 'secretary', 'member'] as const)
const effect = oneOf(['expense', 'receipt', 'charge', 'reversal', 'charge_reversal'] as const)
const action = oneOf([
  'expense', 'receipt', 'charge', 'reversal', 'limit_change',
  'seat_admin', 'unseat_admin', 'appoint_auditor',
] as const)
const opinion = oneOf(['clean', 'qualified', 'adverse', 'disclaimer'] as const)
const tier = oneOf(['pair', 'committee'] as const)

/*
 * A money column. Named so the intent is unmistakable at every call site and
 * so the reason lives in one place: shape enforced, null permitted, and the
 * surface decides through countable.ts.
 */
const money = nullable(int)

export const duesRow = object<DuesRow>({
  flat_id: required(str),
  label: required(str),
  ordinal: required(int),
  has_parking: required(bool),
  charged_minor: money,
  paid_minor: money,
  outstanding_minor: money,
})

export const ledgerRow = object<LedgerRow>({
  seq: required(int),
  recorded_at: required(int),
  fingerprint: required(str),
  effect: required(effect),
  origin_effect: required(effect),
  amount_minor: money,
  currency: required(str),
  proposal_seq: required(int),
  action: required(action),
  proposed_by: required(str),
  counterparty: nullable(str),
  category: nullable(str),
  narration: required(str),
  business_date: required(str),
  flat_id: nullable(str),
  flat_set: nullable(str),
  tier: required(tier),
  required: required(int),
  limit_minor: money,
  reverses_seq: nullable(int),
  replaces_seq: nullable(int),
  reason: nullable(str),
  reversed_by_seq: nullable(int),
  is_cash: required(bool),
  balance_minor: money,
})

export const approval = object<Approval>({
  seq: required(int),
  person: required(str),
  decision: required(oneOf(['approve', 'decline'] as const)),
  role: required(role),
  derived: required(bool),
  recorded_at: required(int),
  signature: required(str),
  key_seq: required(int),
})

export const proposalRow = object<ProposalRow>({
  seq: required(int),
  recorded_at: required(int),
  proposed_by: required(str),
  action: required(action),
  amount_minor: money,
  currency: nullable(str),
  counterparty: nullable(str),
  category: nullable(str),
  narration: required(str),
  business_date: required(str),
  flat_id: nullable(str),
  target_seq: nullable(int),
  reason: nullable(str),
  replacement_amount_minor: money,
  person: nullable(str),
  role: nullable(role),
  fy: nullable(str),
  flat_set: nullable(str),
  flat_count: required(int),
  tier: required(tier),
  required: required(int),
  seated: required(int),
  /* Computed by the server from the limit in force, not a stored column: a
   * null is a broken proposal, not a cell that could not be read. */
  limit_minor: required(int),
  state: required(oneOf(['open', 'posted', 'declined', 'withdrawn', 'superseded', 'year_closed'] as const)),
  posted_seq: nullable(int),
  approvals: required(array(approval)),
  approve_count: required(int),
  decline_count: required(int),
})

export const note = object<Note>({
  seq: required(int),
  note: required(oneOf(['response', 'resolved', 'raised_in_error', 'comment'] as const)),
  text: required(str),
  by: required(str),
  by_author: required(bool),
  recorded_at: required(int),
})

export const disputeRow = object<DisputeRow>({
  seq: required(int),
  recorded_at: required(int),
  handle: required(str),
  scope: required(oneOf(['entries', 'counterparty', 'period'] as const)),
  target_seqs: required(array(int)),
  counterparty: nullable(str),
  period: nullable(str),
  text: required(str),
  is_open: required(bool),
  notes: required(array(note)),
})

export const seat = object<Seat>({
  person_id: required(str),
  role: required(role),
  derived: required(bool),
  seated_seq: required(int),
  unseated_seq: nullable(int),
})

export const person = object<Person>({
  id: required(str),
  full_name: required(str),
  email: required(str),
  phone: nullable(str),
})

const opinionEntry = object<Year['history'][number]>({
  seq: required(int),
  opinion: required(opinion),
  statement: required(str),
  auditor: required(str),
  recorded_at: required(int),
})

export const year = object<Year>({
  fy: required(str),
  starts: required(str),
  ends: required(str),
  ended: required(bool),
  closed: required(bool),
  headline: nullable(opinion),
  headline_seq: nullable(int),
  history: required(array(opinionEntry)),
  /* Null until an auditor is appointed, which is most of a year's life. */
  auditor: nullable(array(object<NonNullable<Year['auditor']>[number]>({
    name: required(str),
    appointment_seq: required(int),
  }))),
})

/*
 * Structuring totals are aggregates the server computed to answer "did these
 * below-limit entries cross the limit". A null makes the whole finding
 * meaningless rather than partly readable, so it fails.
 */
export const structuring = object<Structuring>({
  counterparty: required(str),
  total_minor: required(int),
  limit_minor: required(int),
  first_date: required(str),
  last_date: required(str),
  window_days: required(int),
  constituents: required(array(int)),
})

const categoryAmount = object<Report['income_expenditure']['income'][number]>({
  category: required(str),
  amount_minor: required(int),
})

/*
 * The audit report. Its body is the balance sheet and the profit and loss
 * account, both generated server-side, so a missing section is a broken
 * report rather than an empty one - every section is required. The figures
 * inside stay money-shaped for the same reason as everywhere else.
 */
export const report = object<Report>({
  society: required(object<Report['society']>({
    id: required(str),
    name: required(str),
    city: nullable(str),
  })),
  fy: required(str),
  starts: required(str),
  ends: required(str),
  currency: required(str),
  generated_at: required(int),
  through_seq: required(int),
  through_hash: required(str),
  true_and_fair: required(str),
  income_expenditure: required(object<Report['income_expenditure']>({
    income: required(array(categoryAmount)),
    expenditure: required(array(categoryAmount)),
    total_income_minor: required(int),
    total_expenditure_minor: required(int),
    surplus_minor: required(int),
  })),
  balance_sheet: required(object<Report['balance_sheet']>({
    cash_and_bank_minor: required(int),
    dues_receivable_minor: required(int),
    advances_from_members_minor: required(int),
    opening_fund_minor: required(int),
    surplus_minor: required(int),
    closing_fund_minor: required(int),
    total_assets_minor: required(int),
    total_funds_and_liabilities_minor: required(int),
  })),
  reversals: required(array(object<Report['reversals'][number]>({
    seq: required(int),
    reverses_seq: required(int),
    amount_minor: required(int),
    counterparty: nullable(str),
    reason: required(str),
    business_date: required(str),
  }))),
  /* Generated so it cannot be left out: an adjusting entry against a closed
   * year must be disclosed at the AGM, so an absent array is a failure. */
  adjusting_entries: required(array(object<Report['adjusting_entries'][number]>({
    seq: required(int),
    reverses_seq: required(int),
    corrects_fy: required(str),
    amount_minor: required(int),
    reason: required(str),
    counterparty: nullable(str),
  }))),
  structuring: required(array(structuring)),
  opinions: required(object<Report['opinions']>({
    fy: required(str),
    closed: required(bool),
    headline: nullable(opinion),
    headline_seq: nullable(int),
    history: required(array(opinionEntry)),
  })),
  signoffs: required(array(object<Report['signoffs'][number]>({
    month: required(str),
    seq: required(int),
    through_seq: required(int),
    recorded_at: required(int),
  }))),
})

export const duesRows = array(duesRow)
export const ledgerRows = array(ledgerRow)
export const proposalRows = array(proposalRow)
export const disputeRows = array(disputeRow)
export const seats = array(seat)
export const people = array(person)
export const years = array(year)
export const structurings = array(structuring)

/*
 * api_summary is a separate source from the dues view - the dashboard's
 * headline balance and the arrears count come from here, not from
 * flat_dues - so it needs its own parser. Its figures are computed, so a
 * null is a broken summary; `flats_outstanding` especially, because a count
 * silently reading low is the dues bug in another costume.
 */
export const summary = object<Summary>({
  balance_minor: required(int),
  entries: required(int),
  head_seq: required(int),
  as_of: required(int),
  fy: required(str),
  months: required(array(object<Summary['months'][number]>({
    month: required(str),
    in_minor: required(int),
    out_minor: required(int),
    charged_minor: required(int),
    entries: required(int),
  }))),
  fy_spend: required(array(object<Summary['fy_spend'][number]>({
    category: required(str),
    amount_minor: required(int),
  }))),
  fy_spend_total_minor: required(int),
  outstanding_minor: required(int),
  flats_outstanding: required(int),
  flats: required(int),
})

/* A month sign-off, read back from the chain. */
export const signoffEntry = object<SignoffEntry>({
  sequence: required(int),
  recorded_at: required(int),
  actor: required(str),
  body: required(object<SignoffEntry['body']>({
    month: required(str),
    through_seq: required(int),
  })),
})
export const signoffEntries = array(signoffEntry)

/*
 * Resolving a resident handle. Returns null when the handle is unknown,
 * which is an answer, not a failure - so the whole shape is nullable while
 * every field inside a present one is checked.
 */
export const resolvedHandle = nullable(object<ResolvedHandle>({
  name: required(str),
  flat: required(str),
  kind: required(str),
  ended: nullable(str),
}))

/*
 * The charge preview. `base_minor` is what each flat is about to be charged,
 * so a wrong figure here becomes a real posting: it is required, and an
 * unreadable one must stop the preview rather than render a blank.
 */
export const chargePreview = nullable(object<ChargePreview>({
  flats: required(int),
  base_minor: required(int),
  extra_flats: required(int),
  remainder_labels: required(array(str)),
}))

/*
 * The approval-limit entries, read from the chain the way the server reads
 * them. Two kinds carry a limit under different field names, so each is
 * parsed on its own and the reader picks by kind.
 *
 * The limit is `required` in both. 0006 puts the limit in force in the chain
 * precisely so an approval can be checked against the limit that applied
 * then; a missing one cannot be defaulted, because every default is a claim
 * about which tier was required. It fails instead.
 */
const limitEntry = object<LimitEntry>({
  sequence: required(int),
  kind: required(oneOf(['society_opened', 'posting'] as const)),
  recorded_at: required(int),
  body: required(object<LimitEntry['body']>({
    approval_limit_minor: nullable(int),
    limit_minor: nullable(int),
  })),
})

/*
 * Each row must carry the limit its own kind names. A society_opened without
 * approval_limit_minor, or a limit posting without limit_minor, is a chain
 * that cannot answer which tier was in force - so it is rejected here rather
 * than defaulted to zero by the caller.
 */
export const limitEntries: Parser<LimitEntry[]> = (value, path) => {
  const rows = array(limitEntry)(value, path)
  for (const [i, r] of rows.entries()) {
    const field = r.kind === 'society_opened' ? 'approval_limit_minor' : 'limit_minor'
    if (r.body[field] === null) {
      throw new ShapeError(`${path}[${i}].body.${field}`, `a ${r.kind} entry must carry ${field}, but it was null`)
    }
  }
  return rows
}
