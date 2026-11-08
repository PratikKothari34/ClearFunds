// Row shapes of the read models in backend/supabase/migrations/*_read.sql.
// Views report every column as nullable; these state what the view
// actually guarantees.

/*
 * Every state a proposal can end in. `cf.proposal_status` answers 'posted',
 * 'open', or the `outcome` of a `proposal_closed` entry, and
 * `chain/kinds/ledger.v1.md` item 121 lists those four outcomes. One source,
 * because the list was duplicated in rows.ts and drifted from the API
 * contract, which still documents only three of the six.
 */
export const PROPOSAL_STATES = [
  'open', 'posted', 'declined', 'withdrawn', 'superseded', 'year_closed',
] as const
export type ProposalState = (typeof PROPOSAL_STATES)[number]

export type Role = 'president' | 'treasurer' | 'secretary' | 'member'

/**
 * Committee roles in the order the contract states them, which is the order
 * a committee is read out in: `Same order: president treasurer secretary
 * member`.
 *
 * THE ORDER IS CONTRACT, NOT PRESENTATION. It was a bare array in
 * `routes/committee.tsx`, used as `order.indexOf(a.role)` in a sort
 * comparator - and `indexOf` returns **-1** for anything absent, which sorts
 * that member ABOVE the president rather than failing. A fifth role in the
 * contract would be accepted by the compiler (`Role[]` is satisfied by four
 * entries) and reordered the committee silently.
 *
 * `enums.test.ts` asserts this against the contract row that states it, so
 * the sequence cannot drift from the document in either direction.
 */
export const ROLE_ORDER: readonly Role[] = ['president', 'treasurer', 'secretary', 'member']
export type Effect = 'expense' | 'receipt' | 'charge' | 'reversal' | 'charge_reversal'
export type Action =
  | 'expense' | 'receipt' | 'charge' | 'reversal' | 'limit_change'
  | 'seat_admin' | 'unseat_admin' | 'appoint_auditor'
export type Opinion = 'clean' | 'qualified' | 'adverse' | 'disclaimer'

export type Society = {
  id: string
  name: string
  city: string | null
  currency: string
  /*
   * The currency's minor-unit digits, from the server's ISO 4217 table. Null
   * only on a deployment older than the migration that added it; `money.ts`
   * then falls back to its own ISO table, which refuses an unknown currency
   * rather than guessing. Never derived from `Intl` - it disagrees with ISO
   * 4217 on real currencies.
   */
  currency_exponent: number | null
  fy_start_month: number
  structuring_window_days: number
}

export type Me = {
  person: string
  name: string
  email: string
  society: Society
  seat: { role: Role; derived: boolean } | null
  auditor_for: string[]
  tenure: { id: string; kind: 'owner' | 'tenant'; handle: string; flat_id: string; flat: string; owner_can_see: boolean } | null
  last_seen_seq: number | null
}

/*
 * The money columns are nullable here for the same reason DuesRow's are: the
 * view types every column nullable, nothing validated the response, and a
 * raw nullable reaching a comparison is what hid a flat that owed money.
 * Read them through countable.ts; never compare or arithmetic one directly.
 */
export type LedgerRow = {
  seq: number
  recorded_at: number
  fingerprint: string
  effect: Effect
  origin_effect: Effect
  amount_minor: number | null
  currency: string
  proposal_seq: number
  action: Action
  proposed_by: string
  counterparty: string | null
  category: string | null
  narration: string
  business_date: string
  flat_id: string | null
  flat_set: string | null
  tier: 'pair' | 'committee'
  required: number
  limit_minor: number | null
  reverses_seq: number | null
  replaces_seq: number | null
  reason: string | null
  reversed_by_seq: number | null
  is_cash: boolean
  balance_minor: number | null
}

export type Approval = {
  seq: number
  person: string
  decision: 'approve' | 'decline'
  role: Role
  derived: boolean
  recorded_at: number
  signature: string
  key_seq: number
}

export type ProposalRow = {
  seq: number
  recorded_at: number
  proposed_by: string
  action: Action
  amount_minor: number | null
  currency: string | null
  counterparty: string | null
  category: string | null
  narration: string
  business_date: string
  flat_id: string | null
  target_seq: number | null
  reason: string | null
  replacement_amount_minor: number | null
  person: string | null
  role: Role | null
  fy: string | null
  flat_set: string | null
  flat_count: number
  tier: 'pair' | 'committee'
  required: number
  seated: number
  limit_minor: number
  state: ProposalState
  posted_seq: number | null
  approvals: Approval[]
  approve_count: number
  decline_count: number
}

export type Note = { seq: number; note: 'response' | 'resolved' | 'raised_in_error' | 'comment'; text: string; by: string; by_author: boolean; recorded_at: number }

export type DisputeRow = {
  seq: number
  recorded_at: number
  handle: string
  scope: 'entries' | 'counterparty' | 'period'
  target_seqs: number[]
  counterparty: string | null
  period: string | null
  text: string
  is_open: boolean
  notes: Note[]
}

export type DuesRow = {
  flat_id: string
  label: string
  ordinal: number
  has_parking: boolean
  /*
   * Nullable on purpose, against the contract's "never null" guarantee.
   * Every view column is typed nullable in database.types.ts, api.ts casts
   * rather than validates, and declaring these plain `number` here made the
   * compiler assert something nothing enforced - which is how `null <= 0`
   * reached a comparison and hid a flat that owed money. Read them through
   * countable.ts, never directly.
   */
  charged_minor: number | null
  paid_minor: number | null
  outstanding_minor: number | null
}

export type Seat = { person_id: string; role: Role; derived: boolean; seated_seq: number; unseated_seq: number | null }
export type Person = { id: string; full_name: string; email: string; phone: string | null }

export type Year = {
  fy: string
  starts: string
  ends: string
  ended: boolean
  closed: boolean
  headline: Opinion | null
  headline_seq: number | null
  history: { seq: number; opinion: Opinion; statement: string; auditor: string; recorded_at: number }[]
  auditor: { name: string; appointment_seq: number }[] | null
}

export type Structuring = {
  counterparty: string
  total_minor: number
  limit_minor: number
  first_date: string
  last_date: string
  window_days: number
  constituents: number[]
}

export type Report = {
  society: { id: string; name: string; city: string | null }
  fy: string
  starts: string
  ends: string
  currency: string
  generated_at: number
  through_seq: number
  through_hash: string
  true_and_fair: string
  income_expenditure: {
    income: { category: string; amount_minor: number }[]
    expenditure: { category: string; amount_minor: number }[]
    total_income_minor: number
    total_expenditure_minor: number
    surplus_minor: number
  }
  balance_sheet: {
    cash_and_bank_minor: number
    dues_receivable_minor: number
    advances_from_members_minor: number
    opening_fund_minor: number
    surplus_minor: number
    closing_fund_minor: number
    total_assets_minor: number
    total_funds_and_liabilities_minor: number
  }
  reversals: { seq: number; reverses_seq: number; amount_minor: number; counterparty: string | null; reason: string; business_date: string }[]
  adjusting_entries: { seq: number; reverses_seq: number; corrects_fy: string; amount_minor: number; reason: string; counterparty: string | null }[]
  structuring: Structuring[]
  opinions: Pick<Year, 'fy' | 'closed' | 'headline' | 'headline_seq' | 'history'>
  signoffs: { month: string; seq: number; through_seq: number; recorded_at: number }[]
}

export type Summary = {
  balance_minor: number
  entries: number
  head_seq: number
  as_of: number
  fy: string
  /*
   * `in_minor` and `out_minor` are POSTED movements, so a reversal sits in
   * them gross - a reversed expense is money in, though nobody paid the
   * society anything. That is deliberate and must stay: in less out has to
   * equal the balance. `reversed_in_minor` and `reversed_out_minor` say how
   * much of each side is reversals, both reported POSITIVE, so a surface can
   * disclose the gross figure rather than silently net it. Netting here would
   * be money arithmetic in the client.
   */
  months: {
    month: string
    in_minor: number
    out_minor: number
    reversed_in_minor: number
    reversed_out_minor: number
    charged_minor: number
    entries: number
  }[]
  fy_spend: { category: string; amount_minor: number }[]
  fy_spend_total_minor: number
  outstanding_minor: number
  flats_outstanding: number
  flats: number
}

/* A month sign-off as it is read back from the chain. */
export type SignoffEntry = {
  sequence: number
  recorded_at: number
  actor: string
  body: { month: string; through_seq: number }
}

/* api_resolve_handle: null when the handle is unknown, which is an answer. */
export type ResolvedHandle = { name: string; flat: string; kind: string; ended: string | null }

/* api_preview_charge: what each flat would be charged, before it is posted. */
export type ChargePreview = { flats: number; base_minor: number; extra_flats: number; remainder_labels: string[] }

/* A chain entry that sets or changes the approval limit. Two kinds carry it
 * under different names; the reader picks by kind. */
export type LimitEntry = {
  sequence: number
  kind: 'society_opened' | 'posting'
  recorded_at: number
  body: { approval_limit_minor: number | null; limit_minor: number | null }
}
