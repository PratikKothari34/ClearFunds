import type { FileRouteTypes } from '../routeTree.gen'
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
  /**
   * AN INTERNAL PATH, AND THAT IS ENFORCED, not assumed.
   *
   * This is the one server-supplied value in the product that is fed
   * straight into a navigation target. `string` let the server send
   * anything: an absolute `https://` URL would render the band's most
   * tapped control as a link off the site, on the one screen whose job
   * is routing an approver to the right internal page. TanStack's Link
   * happens to reject `javascript:` and `data:` today, which is a
   * guarantee from the installed version rather than one this product
   * makes.
   *
   * So the type says what is allowed, `isInternalPath` checks it at the
   * band's edge, and an item that fails is dropped rather than
   * rendered.
   */
  readonly href: InternalPath
}

/**
 * A route this app actually has.
 *
 * Taken from the GENERATED route tree, not written out here, so it
 * cannot drift: adding or removing a route changes this union in the
 * same build that changes the routes. A hand-written `/${string}` was
 * the first attempt and the compiler rejected it against TanStack's
 * `Link`, which is stronger again - it wants a known route, and a
 * server naming a path this build does not have is just as broken as
 * one naming another origin.
 */
export type InternalPath = Exclude<FileRouteTypes['to'], `${string}$${string}`>

/**
 * Every static route, as values, so the check is a real membership test.
 *
 * WRITTEN OUT, AND GUARDED BY A TEST THAT COMPARES IT TO THE GENERATED
 * TREE. A type cannot be iterated at runtime, so a validator that
 * claims `value is InternalPath` from a string-shape check alone is
 * lying: `/nope` has the right shape and is not a route. The list is
 * therefore literal, and `types.routes.test.ts` fails if the route
 * tree gains or loses a static route without this list following -
 * which is the only way a hand-maintained list stays honest.
 *
 * Param routes are excluded on purpose: `/ledger/$entryId` is a
 * pattern, and navigating to it needs a `params` object that
 * `AttentionItem` does not carry. An item that wants to point at one
 * entry is a change to the contract, not a string this list should
 * accept.
 */
export const INTERNAL_PATHS: readonly InternalPath[] = [
  '/',
  '/approvals',
  '/committee',
  '/disputes',
  '/dues',
  '/login',
  '/my-flat',
  '/reports',
  '/sign-off',
  '/verify',
  '/year-end',
  '/ledger/flagged',
  '/ledger/reversed',
  '/ledger',
]

/**
 * Whether a server-supplied href is a route this app may navigate to.
 *
 * A MEMBERSHIP TEST, NOT A SHAPE TEST. The first version checked for a
 * leading slash and no backslash, which rejects `javascript:` and
 * `//evil.example` but accepts `/nope` - and `Link` then throws or
 * navigates nowhere. Since the only legitimate values are a known
 * route, the check is against the list of them, which rejects every
 * scheme and every other origin as a side effect rather than as a rule
 * that has to anticipate them.
 */
export function isInternalPath(value: unknown): value is InternalPath {
  return (
    typeof value === 'string' &&
    (INTERNAL_PATHS as readonly string[]).includes(value)
  )
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

/**
 * One seat on the managing committee.
 *
 * SEATS, NOT USERS. The statutory body is a fixed number of elected
 * seats (bye-law 113 puts it at 11-13 for this market), and the
 * approval denominator M is the seat count — not the count of people
 * who happen to be able to sign today. A vacant or restricted seat
 * therefore still occupies the roster and still counts toward M.
 *
 * That distinction is the whole reason this type exists. If M were
 * derived from active signers, a committee could resign its way to a
 * lower threshold: seven resignations from thirteen would take
 * `ceil(2M/3)` from 9 to 4, and the remaining four could then clear
 * anything. The denominator is locked to the statutory seat count, and
 * `status` records why a seat cannot sign rather than removing it.
 */
export type SeatStatus =
  /** Holds a key and may sign. */
  | 'active'
  /** Elected, but barred from signing pending ratification at the AGM. */
  | 'restricted'
  /** No sitting member. Still counts toward M. */
  | 'vacant'

export interface CommitteeSeat {
  /** Position on the statutory register, 1-based. */
  readonly seat: number
  /** Absent on a vacant seat. A handle on resident-visible payloads. */
  readonly holderHandle?: string
  /** 'Treasurer', 'Secretary', 'President', or absent for a plain member. */
  readonly office?: string
  readonly status: SeatStatus
  /**
   * Why this seat cannot sign. Present only when `status` is not
   * 'active' — stated rather than left blank, because an unexplained
   * gap in a roster reads as a loading failure.
   */
  readonly restrictionReason?: string
}

/**
 * The approval rule in force, as the chain recorded it.
 *
 * Every field is snapshotted, never read from live config. The limit
 * and the seat count that applied WHEN an entry was raised are what
 * that entry's approvals are checkable against; reading today's values
 * would let a committee lower the limit afterwards and retroactively
 * legitimise an approval already given.
 */
export interface ApprovalPolicy {
  /** Statutory seats. The denominator M. */
  readonly seats: number
  /** `ceil(2 * seats / 3)`, server-computed and snapshotted. */
  readonly quorumRequired: number
  /** At or below this, treasurer AND secretary. Above it, N-of-M. */
  readonly limit: Money
}

/**
 * A flat's position on the maintenance register.
 *
 * `outstanding` is server-computed like every other figure here. The
 * frontend never subtracts `paid` from `billed`: a flat showing a
 * wrong arrears figure is told to pay money it does not owe, or not
 * chased for money it does.
 */
export interface MatrixRow {
  readonly flat: string
  /** 'owner' or 'tenant'. Shown because liability differs. */
  readonly tenancy: 'owner' | 'tenant'
  readonly billed: Money
  readonly paid: Money
  readonly outstanding: Money
  /**
   * Days past due, server-computed. Absent when nothing is overdue —
   * absent rather than 0, so "not overdue" and "overdue by zero days"
   * cannot be confused.
   */
  readonly overdueDays?: number
}

/**
 * How an indivisible remainder was shared out.
 *
 * THE ROUNDING POLICY, MADE VISIBLE. A charge split across flats
 * rarely divides evenly: 1000 paise across 3 flats leaves 1 paise. The
 * server assigns each leftover minor unit to the flat with the lowest
 * cumulative share so far, so the advantage rotates and no flat is
 * systematically favoured.
 *
 * It is disclosed rather than hidden because a resident who adds up
 * the per-flat figures and gets a different total from the society's
 * is looking at an apparent discrepancy of exactly the kind this
 * product exists to explain.
 */
export interface AllocationRemainder {
  /** What was divided. */
  readonly total: Money
  readonly flatCount: number
  /** Minor units that did not divide evenly. */
  readonly remainderMinor: number
  /** Flats that took one extra minor unit this time. */
  readonly carriedBy: readonly string[]
}
