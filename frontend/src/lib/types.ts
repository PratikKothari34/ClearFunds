// Row shapes of the read models in backend/supabase/migrations/*_read.sql.
// Views report every column as nullable; these state what the view
// actually guarantees.

export type Role = 'president' | 'treasurer' | 'secretary' | 'member'
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

export type LedgerRow = {
  seq: number
  recorded_at: number
  fingerprint: string
  effect: Effect
  origin_effect: Effect
  amount_minor: number
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
  limit_minor: number
  reverses_seq: number | null
  replaces_seq: number | null
  reason: string | null
  reversed_by_seq: number | null
  is_cash: boolean
  balance_minor: number
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
  state: 'open' | 'posted' | 'declined' | 'withdrawn' | 'superseded' | 'year_closed'
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
  charged_minor: number
  paid_minor: number
  outstanding_minor: number
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
