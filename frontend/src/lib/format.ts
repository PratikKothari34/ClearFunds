import { PROPOSAL_STATES } from './types'
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

/*
 * Which flats a charge hits, for a committee member deciding whether to
 * approve it. `chain/kinds/ledger.v1.md` item 15 defines three values, and
 * `flat` arrived after this screen was written: a binary "is it parking?"
 * check rendered a ONE-FLAT charge as "Every flat", the opposite of what it
 * does, on the screen where someone approves it.
 *
 * An unrecognised value therefore never falls through to a specific claim.
 * It says only what is certain - the flat count is shown beside this - so a
 * value added to the contract next shows as unlabelled rather than as a lie.
 */
export const flatSetLabel = (f: string | null): string =>
  f === 'parking' ? 'Flats with parking'
  : f === 'all' ? 'Every flat'
  : f === 'flat' ? 'One flat'
  : 'Some flats'

export const actionLabel: Record<Action, string> = {
  expense: 'Expense', receipt: 'Receipt', charge: 'Charge', reversal: 'Reversal',
  limit_change: 'Limit change', seat_admin: 'Seat member', unseat_admin: 'Unseat member',
  appoint_auditor: 'Appoint auditor',
}

/*
 * What approving a proposal consents to, beyond the proposal itself, or null
 * when it consents to nothing further.
 *
 * `appoint_auditor` is the one case today. The appointment posting IS the
 * society's recorded authorisation to publish that auditor's statement for
 * the year - there is no separate consent entry, deliberately, because a late
 * or missing one would either publish a statement without consent or hand a
 * committee a lever to stall a year whose opinion it disliked. The approver
 * is therefore consenting to a disclosure, and has to be told so before
 * deciding.
 *
 * This lives here, not in the route, because WHICH actions carry a
 * consequence is a decision and the route is the reporter. A `Record` over
 * `Action` rather than a `switch` with a default: adding an action to the
 * union fails the typecheck here, so a new action that discloses something
 * cannot ship silently without one.
 */
export const approvalDiscloses: Record<Action, ((who: string, fy: string) => string) | null> = {
  expense: null, receipt: null, charge: null, reversal: null,
  limit_change: null, seat_admin: null, unseat_admin: null,
  appoint_auditor: (who, fy) =>
    `Approving this authorises ${who}’s statement for FY ${fy} to be published to every member.`,
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

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`

/**
 * '2026-10' for a date.
 *
 * Eight surfaces wrote `.slice(0, 7)` inline while this named helper went
 * unused. Not a style point: the ledger groups by it, the dispute form seeds
 * its period from it, and `month()` is called on the result - so a change to
 * what a month KEY is has eight places to miss and one to change. The two
 * remaining slices in pending.ts are deliberately not this: one normalises a
 * string before a regex, the other reads an ISO string it just built.
 */
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

/*
 * Severity, as an order rather than a comment.
 *
 * `clean < qualified < adverse < disclaimer` is the contract's own ranking
 * (item 11), and a disclaimer is WORSE than an adverse opinion - the auditor
 * could not form an opinion at all. The order lived only in a doc comment and
 * in the incidental order of three array literals, so nothing stopped a
 * surface from ranking them wrongly.
 */
const SEVERITY: Record<Opinion, number> = { clean: 0, qualified: 1, adverse: 2, disclaimer: 3 }

/**
 * The more serious of two opinions. The headline is the most serious one ever
 * received, never the most recent, so a year that went adverse and was later
 * revisited still headlines adverse.
 */
export const worseOpinion = (a: Opinion, b: Opinion): Opinion => (SEVERITY[b] > SEVERITY[a] ? b : a)

/** The most serious opinion in a history, or null if it is empty. */
export const headlineOpinion = (os: readonly Opinion[]): Opinion | null =>
  os.length === 0 ? null : os.reduce(worseOpinion)

/*
 * Severity colour: clean reads as checked-against, anything worse as a break.
 *
 * A null is NOT calm. It means no opinion was recorded, which on a year the
 * server says is closed is a gap in the record, not a reassurance - so it
 * takes `attention`, never the same tone as a clean opinion. The caller that
 * genuinely has no year yet passes nothing and gets the neutral chip from
 * `opinionChip` instead.
 */
export const opinionTone = (o: Opinion | null | undefined) =>
  o === 'clean' ? ('anchor' as const)
  : o === 'qualified' ? ('attention' as const)
  : o ? ('break' as const)
  : o === null ? ('attention' as const)
  : ('neutral' as const)

/** The chip tones a surface may ask for. Mirrors ui.tsx's own union; this
 * module stays free of component imports, so the names are repeated here and
 * format.test.ts asserts the two lists still agree - a tone added there and
 * not here would make auditChip unable to ask for it, and a tone removed
 * there would resolve to no class at all. */
type Tone = 'neutral' | 'credit' | 'debit' | 'attention' | 'anchor' | 'break' | 'accent'

/*
 * A YEAR'S AUDIT CHIP, WHICH DEPENDS ON WHETHER THE YEAR IS CLOSED.
 *
 * `headline === null` means two completely different things, and the tone and
 * the wording both turn on which:
 *
 *   - an OPEN year has simply not been audited yet, which is the ordinary
 *     state for most of a year's life and must read as calm. Warning every
 *     resident for eleven months is noise, and noise is what makes a real
 *     warning ignorable.
 *   - a CLOSED year with no opinion is a GAP IN THE RECORD. The year is
 *     sealed, so an opinion should exist. "Not yet audited" is a false
 *     reassurance here: nothing further is pending.
 *
 * So the caller passes `closed`, which every surface already has - the report
 * carries it beside the headline, and a year row declares it. Taking the
 * tone from the opinion alone cannot express this, which is why this exists
 * rather than each screen writing its own ternary. Three screens wrote one;
 * one of them rendered a disclaimer as reassuring.
 */
export const auditChip = (closed: boolean, o: Opinion | null | undefined): { tone: Tone; text: string } =>
  o ? { tone: opinionTone(o), text: `Audit: ${opinionLabel[o]}` }
  : closed ? { tone: 'attention', text: 'Closed, no opinion recorded' }
  : { tone: 'neutral', text: 'Not yet audited' }

/**
 * What a chip says for an opinion that may be absent. A closed year with no
 * recorded opinion rendered an EMPTY chip under a lock icon, because
 * `opinionLabel[y.headline!]` is `undefined` - the seal, the most
 * consequential state in the audit model, read as nothing at all.
 */
export const opinionChip = (o: Opinion | null | undefined): string =>
  o ? opinionLabel[o] : 'Opinion not recorded'

/*
 * What happened to a proposal, from the `status` a write returned.
 *
 * Three outcomes, because three is what a person needs to know: it is on the
 * ledger, it is waiting for more approvals, or it is closed and will never
 * post. `declined`, `withdrawn`, `superseded` and `year_closed` are four
 * different closings and none of them is "waiting" - the call sites used to
 * read `status === 'posted' ? done : waiting`, so a DECLINED proposal
 * reported success.
 *
 * Not `oneOf`: a status this build does not recognise is not a failed write.
 * The entry was made. Throwing would tell the person it did not happen,
 * which is the one answer that is certainly wrong - so an unknown value
 * degrades to `'unknown'` and the copy hedges. Compare `flatSetLabel`.
 */
export type WriteOutcome = 'posted' | 'open' | 'closed' | 'unknown'

export function writeOutcome(status: unknown): WriteOutcome {
  if (status === 'posted') return 'posted'
  if (status === 'open') return 'open'
  // Every other state the chain defines is a closing. Derived from the list,
  // not re-listed here: a seventh state added to PROPOSAL_STATES reads as
  // closed, which is true of every closing outcome the contract has, rather
  // than falling to the hedge or - worse - to "waiting".
  if (typeof status === 'string' && (PROPOSAL_STATES as readonly string[]).includes(status)) return 'closed'
  return 'unknown'
}

/*
 * IS THIS PERIOD A MONTH OR A FINANCIAL YEAR?
 *
 * `chain/kinds/ledger.v1.md` item 4 of the flag row gives `period` two
 * shapes, `YYYY-MM` and `YYYY-YY`, and both are seven characters with a
 * hyphen at index 4. The disputes screen discriminated them by whether the
 * second half was <= 12, which is wrong three ways and all three reach a
 * resident reading a dispute about their own money:
 *
 *   - `2011-12` is FY 2011-12 and rendered as "December 2011". Every
 *     financial year ending in a year 00-12 of its century collides -
 *     2009-10, 2010-11, 2011-12 - so the screen names a single month for a
 *     dispute raised about a whole year.
 *   - `2026-00` passed the <= 12 test, made an Invalid Date, and
 *     Intl.format on NaN is a RangeError. Thrown during render, inside a
 *     list item, so the whole disputes screen is replaced by the boundary
 *     rather than one line reading oddly.
 *   - A null period rendered the literal string "FY null".
 *
 * The real discriminator is not a magnitude. `fyOf` builds a financial year
 * as the start year and the NEXT year's last two digits, so the second half
 * of `YYYY-YY` is always the first half plus one, mod 100. A month never is:
 * `2026-27` cannot be a month and `2026-03` cannot be a year that follows
 * 2026. That is exact, and it needs no range guess.
 *
 * An unreadable period is disclosed as unreadable. It is never shown as a
 * month, because naming the wrong period on a dispute is worse than saying
 * the period could not be read.
 */
export type Period =
  | { kind: 'month'; value: string }
  | { kind: 'fy'; value: string }
  | { kind: 'unreadable' }

export function period(p: string | null | undefined): Period {
  if (typeof p !== 'string' || !/^\d{4}-\d{2}$/.test(p)) return { kind: 'unreadable' }
  const head = Number(p.slice(0, 4))
  const tail = Number(p.slice(5))
  if (tail === (head + 1) % 100) return { kind: 'fy', value: p }
  if (tail >= 1 && tail <= 12) return { kind: 'month', value: p }
  return { kind: 'unreadable' }
}

/** What a resident reads for a period, disclosing one it could not read. */
export function periodLabel(p: string | null | undefined): string {
  const r = period(p)
  return r.kind === 'month' ? month(r.value) : r.kind === 'fy' ? `FY ${r.value}` : 'An unrecorded period'
}
