import type { Money } from './money'

/*
 * Re-exported so a component reading a payload imports every shape in
 * it from one module. Money lives in money.ts because the formatting
 * and parsing rules live there, but it is as much part of the wire
 * contract as Entry is.
 */
export type { Money }

/**
 * The shapes the frontend reads. These mirror the backend contract in the
 * design document; nothing here is implemented server-side by this
 * project, and every field this file declares is one the server must
 * supply already filtered for the viewer's role.
 *
 * The rule that shapes these types: a field a viewer may not see is
 * ABSENT from their payload, not present-and-hidden. A hidden field is
 * one devtools pane away from visible, so resident anonymity cannot be a
 * rendering decision.
 */

/** Six roles. Navigation and approval surfaces are designed against six. */
export type Role =
  | 'president'
  | 'treasurer'
  | 'secretary'
  | 'committee'
  | 'resident'
  | 'auditor'

export interface Viewer {
  readonly role: Role
  /** A handle, never a name, on anything resident-visible. */
  readonly handle: string
  readonly societyName: string
  /** Present for a resident; absent for an auditor. */
  readonly flat?: string
}

/**
 * Where an entry stands. A reversed entry stays visible and marked; it is
 * never edited away, because mutating it would break its hash.
 */
export type EntryState = 'posted' | 'reversed' | 'reversal' | 'pending'

export interface Entry {
  readonly id: string
  /** Chain position. Monotonic, assigned by the server. */
  readonly sequence: number
  /** ISO 8601. When the entry was POSTED, which is what periods count by. */
  readonly postedAt: string
  readonly narration: string
  readonly payee: string
  readonly amount: Money
  readonly direction: 'in' | 'out'
  readonly state: EntryState
  /**
   * Running balance AFTER this entry, computed by the server. The
   * frontend never derives this: a balance re-derived from a page of rows
   * is wrong whenever the page is short.
   */
  readonly balanceAfter: Money
  /** Set on a reversed entry: the reversal that cancelled it. */
  readonly reversedBy?: EntryRef
  /** Set on a reversal: what it cancels, and why. Reason is mandatory. */
  readonly reverses?: EntryRef
  readonly reversalReason?: string
  /** Unresolved flags only. A resolved flag leaves this count. */
  readonly openFlagCount: number
  /** Short fingerprint for display. Never a preimage. */
  readonly fingerprint: string
}

export interface EntryRef {
  readonly id: string
  readonly sequence: number
  readonly postedAt: string
}

/**
 * One question raised against an entry, resolved or not.
 *
 * `authorHandle` is ABSENT, not blanked, on a payload where the viewer
 * may not see who asked. Residents are anonymous to each other;
 * treasurer, secretary and president see handles. A blanked field is
 * one devtools pane away from visible.
 *
 * `resolvedAt` and `answer` are appended, never an edit: resolution is
 * itself a record. A resolved question stays in this log forever and
 * only leaves the unresolved COUNT.
 */
export interface FlagLogItem {
  readonly id: string
  readonly question: string
  readonly raisedAt: string
  readonly authorHandle?: string
  readonly resolvedAt?: string
  readonly answer?: string
}

/**
 * The approval tier an entry falls in. Decided by amount against the
 * limit that was IN FORCE when the entry was raised — the server reads
 * it from the chain, never from live config, so lowering the limit
 * later cannot retroactively legitimise an approval.
 *
 * `both` means treasurer AND secretary, two people. It never reduces to
 * one: no single admin moves the ledger alone, at any limit.
 */
export type ApprovalTier = 'both' | 'n-of-m'

export interface PendingApproval {
  readonly id: string
  readonly narration: string
  readonly payee: string
  readonly amount: Money
  readonly direction: 'in' | 'out'
  readonly raisedAt: string
  readonly raisedByHandle: string
  readonly tier: ApprovalTier
  /** Approvals already recorded. */
  readonly approvedCount: number
  /** How many this entry needs, snapshotted when it was raised. */
  readonly approvalsRequired: number
  /** True when this viewer has already approved; the button then says so. */
  readonly viewerHasApproved: boolean
  /**
   * The limit that applied when this was raised, for the line explaining
   * why this entry needs the tier it needs.
   */
  readonly limitInForce: Money
}

/**
 * Below-limit entries to one payee that together cross the limit inside
 * a rolling window. Made VISIBLE, never blocked: blocking teaches
 * splitting across payees, which is harder to see.
 */
export interface StructuringGroup {
  readonly payee: string
  readonly total: Money
  readonly windowDays: number
  readonly entryIds: readonly string[]
}

/** A period awaiting the president's monthly sign-off. */
export interface SignoffPeriod {
  readonly id: string
  readonly label: string
  readonly inflow: Money
  readonly outflow: Money
  readonly entryCount: number
  /** Unresolved questions inside the period. Shown before the button. */
  readonly openFlagCount: number
  /** Structuring groups inside the period, surfaced before signing. */
  readonly structuring: readonly StructuringGroup[]
}

/** A flat's dues position. Amounts from the server; never derived here. */
export interface DuesRow {
  readonly flat: string
  readonly billed: Money
  readonly paid: Money
  readonly outstanding: Money
  readonly asOf: string
}

/**
 * Audit opinion severity. Ordered deliberately: a DISCLAIMER is worse
 * than an adverse opinion. Any headline reads the MOST SERIOUS opinion
 * ever received — never "most adverse", which is ambiguous under this
 * ranking.
 */
export type OpinionSeverity = 'clean' | 'qualified' | 'adverse' | 'disclaimer'

export const OPINION_RANK: Readonly<Record<OpinionSeverity, number>> = {
  clean: 0,
  qualified: 1,
  adverse: 2,
  disclaimer: 3,
}

export interface AuditYear {
  readonly year: string
  /** Absent until an auditor has signed off. A date is not a close. */
  readonly closedAt?: string
  readonly opinion?: OpinionSeverity
  /** The auditor's own wording, server-held. */
  readonly opinionNote?: string
}

/**
 * An adjusting entry posted in the current period against a closed
 * year. Must be DISCLOSED at the AGM; the report generates this section
 * so it cannot be left out.
 */
export interface AdjustingEntry {
  readonly entryId: string
  readonly correctsYear: string
  readonly amount: Money
  readonly reason: string
  readonly postedAt: string
}

export interface ReportSummary {
  readonly id: string
  readonly label: string
  readonly periodLabel: string
  /** Server-generated only. A client-rendered report can be altered. */
  readonly generatedAt?: string
  readonly kind: 'agm' | 'audit' | 'period'
}

/**
 * The result of comparing this device's view against the chain head
 * published outside the committee's control.
 *
 * This is the fingerprint band's data: TWO DATES, never a one-word
 * status. A resident is told when the record was published and when
 * this device last compared against it, because a single word like
 * "verified" hides which of those two things is stale.
 *
 * A UNION, not one shape with a `state` tag, because the states do not
 * all know the same things. `unreachable` is the case that forces it:
 * if the published record could not be fetched, then its publication
 * date and source were not fetched either. A single shape requiring
 * `publishedAt` would have to be fed a placeholder on exactly the path
 * where the product must not claim to know anything — and a
 * plausible-looking fabricated date in the one band whose whole job is
 * honesty is the worst available place for one.
 */
export type AnchorStatus =
  | AnchorCompared
  | AnchorFirstVisit
  | AnchorUnreachable

interface AnchorCompared {
  readonly state: 'match' | 'mismatch'
  readonly publishedAt: string
  /** Named, so the band can say where the record was published. */
  readonly publishedSource: string
  /** Absent if this device has not successfully compared before. */
  readonly lastComparedAt?: string
}

interface AnchorFirstVisit {
  readonly state: 'first-visit'
  readonly publishedAt: string
  readonly publishedSource: string
  /** Never present: a first visit is defined by having no earlier compare. */
  readonly lastComparedAt?: undefined
}

interface AnchorUnreachable {
  readonly state: 'unreachable'
  /**
   * Absent when the fetch failed outright. Present when the record was
   * reached before but not now, which is the more useful case: "last
   * matched 18 Oct" is the most this band can honestly say.
   */
  readonly publishedAt?: string
  readonly publishedSource?: string
  readonly lastComparedAt?: string
}

/**
 * One activity-band item. Assembled server-side per viewer and already
 * role-filtered: the band must not be built client-side from a fuller
 * payload.
 */
export interface AttentionItem {
  readonly id: string
  readonly kind: 'approval' | 'flag' | 'signoff' | 'dues'
  /** Plain-language line, already written for this viewer. */
  readonly label: string
  readonly amount?: Money
  readonly href: string
}

export interface DashboardData {
  readonly balance: Money
  readonly asOf: string
  readonly entryCount: number
  readonly period: {
    readonly label: string
    readonly inflow: Money
    readonly outflow: Money
  }
  /**
   * At most five, ordered by what needs this viewer first. An empty array
   * means "nothing needs you" — which is the normal case for a resident
   * and is NOT the same as a failed fetch.
   */
  readonly attention: readonly AttentionItem[]
  readonly recent: readonly Entry[]
}
