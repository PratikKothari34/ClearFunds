import type { Action, LedgerRow, Opinion, ProposalRow, Role } from './types'

// One catalogue for every label a person reads, so a second language is a
// catalogue rather than a hunt (English only today, GOALS.md).

const tz = 'Asia/Kolkata'

/** A business date is a calendar date, not an instant: read it as one. */
export function day(d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  const [y, m, dd] = d.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: 'UTC' }).format(Date.UTC(y!, m! - 1, dd ?? 1))
}

export const longDay = (d: string) => day(d, { day: 'numeric', month: 'short', year: 'numeric' })

export function month(m: string, opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }) {
  return day(`${m}-01`, opts)
}

export function instant(ms: number, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) {
  return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: tz }).format(ms)
}

export function ago(ms: number, now = Date.now()) {
  const s = Math.round((now - ms) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} d ago`
  return instant(ms, { day: 'numeric', month: 'short', year: 'numeric' })
}

export const daysOpen = (ms: number, now = Date.now()) => Math.max(0, Math.floor((now - ms) / 86_400_000))

export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(Date.now())
}

export const roleLabel: Record<Role, string> = {
  president: 'President', treasurer: 'Treasurer', secretary: 'Secretary', member: 'Committee member',
}

export const categories: { id: string; label: string }[] = [
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'security', label: 'Security' },
  { id: 'housekeeping', label: 'Housekeeping' },
  { id: 'electricity', label: 'Electricity' },
  { id: 'water', label: 'Water' },
  { id: 'lift', label: 'Lift' },
  { id: 'repairs', label: 'Repairs' },
  { id: 'gardening', label: 'Gardening' },
  { id: 'audit', label: 'Audit' },
  { id: 'admin', label: 'Admin' },
  { id: 'parking', label: 'Parking' },
  { id: 'events', label: 'Events' },
  { id: 'other', label: 'Other' },
]

export const categoryLabel = (c: string | null) =>
  categories.find((x) => x.id === c)?.label ?? (c ? c[0]!.toUpperCase() + c.slice(1) : 'Uncategorised')

export const actionLabel: Record<Action, string> = {
  expense: 'Expense', receipt: 'Receipt', charge: 'Charge', reversal: 'Reversal',
  limit_change: 'Limit change', seat_admin: 'Seat member', unseat_admin: 'Unseat member',
  appoint_auditor: 'Appoint auditor',
}

export const opinionLabel: Record<Opinion, string> = {
  clean: 'Clean', qualified: 'Qualified', adverse: 'Adverse', disclaimer: 'Disclaimer',
}

/** Severity order is clean < qualified < adverse < disclaimer (item 11). */
export const opinionHint: Record<Opinion, string> = {
  clean: 'No material misstatement found on the evidence examined.',
  qualified: 'Sound except for the matters stated.',
  adverse: 'The statements are materially misstated.',
  disclaimer: 'The auditor could not form an opinion: evidence was not produced.',
}

export function rowTitle(r: Pick<LedgerRow, 'counterparty' | 'effect' | 'narration'>) {
  if (r.effect === 'charge' || r.effect === 'charge_reversal') return r.narration
  return r.counterparty ?? r.narration
}

export function proposalTitle(p: ProposalRow, names: Map<string, string>) {
  switch (p.action) {
    case 'limit_change': return 'Change the approval limit'
    case 'seat_admin': return `Seat ${names.get(p.person ?? '') ?? 'a member'}`
    case 'unseat_admin': return `Unseat ${names.get(p.person ?? '') ?? 'a member'}`
    case 'appoint_auditor': return `Appoint ${names.get(p.person ?? '') ?? 'an auditor'}`
    case 'charge': return p.narration
    case 'reversal': return `Reverse: ${p.counterparty ?? p.narration}`
    default: return p.counterparty ?? p.narration
  }
}

export const tierLabel = (p: Pick<ProposalRow, 'tier' | 'required' | 'seated'>) =>
  p.tier === 'pair' ? 'Treasurer + Secretary' : `${p.required} of ${p.seated} committee`

export const shortHash = (h: string) => h.slice(0, 4) + ' ' + h.slice(4, 8)

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`

/** '2026-10' for a date. */
export const monthOf = (d: string) => d.slice(0, 7)

export function fyOf(d: string, startMonth: number) {
  const y = Number(d.slice(0, 4))
  const m = Number(d.slice(5, 7))
  const s = m >= startMonth ? y : y - 1
  return `${s}-${String((s + 1) % 100).padStart(2, '0')}`
}

export function initials(name: string) {
  return name.replace(/^CA\s+/, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

/** Severity colour: clean reads as checked-against, anything worse as a break. */
export const opinionTone = (o: Opinion | null) =>
  o === 'clean' ? ('anchor' as const) : o === 'qualified' ? ('attention' as const) : o ? ('break' as const) : ('neutral' as const)
