import type { Role } from './types'
import type { IconName } from '../components/Icon'

/**
 * Navigation, derived from the role.
 *
 * Role filtering here is COSMETIC. The server refuses hidden surfaces to
 * direct requests; this only decides what is worth showing. Nothing in
 * this file is a permission check.
 *
 * `Verify` is deliberately absent from every role's items. It is reached
 * from the fingerprint band and from an entry's detail sheet, because
 * promoting it to the bar tells every resident on every screen that doubt
 * is a normal state.
 */

export interface NavItem {
  readonly to: string
  readonly label: string
  /**
   * The rail glyph. Required, not optional: an item added without one
   * would render a label hanging in a column of icons, and an optional
   * field would let that through silently.
   */
  readonly icon: IconName
  /** Items carrying a live count are promoted out of `More` on mobile. */
  readonly countable?: boolean
  /** Never demoted to `More`, whatever the count. */
  readonly pinned?: boolean
}

const HOME: NavItem = { to: '/', label: 'Home', icon: 'home', pinned: true }
const LEDGER: NavItem = { to: '/ledger', label: 'Ledger', icon: 'account_balance' }
/*
 * LABELLED IN THE WORDS THE PAGES USE.
 *
 * This item was `Disputes` and the ledger tab beside it was `Flagged`,
 * while every page under both says "question" - "Every question raised
 * so far has been answered", "questions not yet answered". That is
 * three vocabularies for one thing, and the audience is a resident who
 * has never used an accounting product.
 *
 * `Disputes` is also wrong in substance, not only in register: a flag
 * has no financial effect. A resident asking why a bill was 8,000
 * rupees is asking a question; calling it a dispute tells them, and
 * tells the committee reading the badge, that they have escalated
 * something. That discourages exactly the behaviour the ledger exists
 * to invite.
 */
const DISPUTES: NavItem = {
  to: '/disputes',
  label: 'Questions',
  icon: 'flag',
  countable: true,
}
const APPROVALS: NavItem = {
  to: '/approvals',
  label: 'Approvals',
  icon: 'check_circle',
  countable: true,
}
const REPORTS: NavItem = { to: '/reports', label: 'Reports', icon: 'description' }
const DUES: NavItem = { to: '/dues', label: 'Dues', icon: 'grid_view' }
const MY_FLAT: NavItem = { to: '/my-flat', label: 'My flat', icon: 'home' }
const SIGNOFF: NavItem = {
  to: '/sign-off',
  label: 'Sign-off',
  icon: 'gavel',
  countable: true,
  pinned: true,
}
const YEAR_END: NavItem = { to: '/year-end', label: 'Year-end', icon: 'schedule' }

const BY_ROLE: Record<Role, readonly NavItem[]> = {
  // The resident keeps four items, so the surface this audience uses most
  // stays the simplest thing in the product.
  resident: [HOME, LEDGER, MY_FLAT, DISPUTES],
  treasurer: [HOME, LEDGER, APPROVALS, DISPUTES, DUES, REPORTS],
  secretary: [HOME, LEDGER, APPROVALS, DISPUTES, DUES, REPORTS],
  committee: [HOME, LEDGER, APPROVALS, DISPUTES, REPORTS],
  /*
   * Sign-off is the president's job and is never demoted.
   *
   * LEDGER AND DUES WERE BOTH MISSING. The president is the one role
   * asked to put their name on a month's figures, and had no way to
   * reach the history those figures come from - they could sign the
   * sheet and not open the entries behind it. Dues was absent while
   * `canSeeAllDues` already granted it to them, so the permission and
   * the navigation disagreed: a surface they are entitled to, with no
   * link to it anywhere.
   *
   * Six items, so one is demoted to `More` on mobile. Sign-off is
   * pinned and Approvals and Disputes carry counts, so the demoted one
   * is Ledger, Dues or Reports - none of which is time-critical.
   */
  president: [HOME, SIGNOFF, LEDGER, APPROVALS, DISPUTES, DUES, REPORTS],
  auditor: [HOME, LEDGER, YEAR_END, DISPUTES],
}

export function navFor(role: Role): readonly NavItem[] {
  return BY_ROLE[role]
}

export const MOBILE_TAB_MAX = 5

/**
 * Splits the items into a bottom tab bar and a `More` group.
 *
 * Two rules, both from the design: at most five tabs, and anything
 * carrying a live count is promoted out of `More`. A badge inside a
 * collapsed menu is a notification nobody sees.
 */
export function splitForMobile(
  items: readonly NavItem[],
  counts: Readonly<Record<string, number>> = {},
): { tabs: readonly NavItem[]; more: readonly NavItem[] } {
  if (items.length <= MOBILE_TAB_MAX) return { tabs: items, more: [] }

  // A LIVE count, not the `countable` flag: the flag says an item can
  // carry a badge, which is true of several and so cannot order them.
  // Promotion is earned by actually having something pending.
  const hasCount = (i: NavItem) => (counts[i.to] ?? 0) > 0

  // Priority: pinned, then anything with a live count, then declaration
  // order. Declaration order is kept within each group so the bar does
  // not reshuffle as counts change — a tab that moves is a tab a
  // volunteer has to hunt for.
  const rank = (i: NavItem) => (i.pinned ? 0 : hasCount(i) ? 1 : 2)
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)

  // One slot is spent on `More` itself.
  const keep = new Set(
    ordered.slice(0, MOBILE_TAB_MAX - 1).map(({ item }) => item.to),
  )

  return {
    tabs: items.filter((i) => keep.has(i.to)),
    more: items.filter((i) => !keep.has(i.to)),
  }
}

/**
 * Second-level tabs within the ledger. Never a nested menu.
 *
 * `Cancelled` and `Questions`, not `Reversed` and `Flagged`, for the
 * same reason as the item above: the rows these tabs filter to render
 * the word "cancelled", in `<s>` and again for a screen reader, and
 * the pages say "question". A tab named `Reversed` over rows that say
 * `Cancelled` leaves a resident checking whether they are looking at
 * the right list.
 *
 * The URLs are deliberately NOT renamed to match. A path is a shared
 * link - a resident pastes /ledger/reversed into the society's
 * WhatsApp group - and TanStack file routing makes the filename the
 * route, so renaming one is a URL change that breaks every link
 * already sent. The label is what a human reads; the path is an
 * address.
 */
export const LEDGER_TABS = [
  { to: '/ledger', label: 'All' },
  { to: '/ledger/reversed', label: 'Cancelled' },
  { to: '/ledger/flagged', label: 'Questions' },
] as const

/**
 * The rail's two labelled groups.
 *
 * The Stitch export groups its sidebar under "Statutory Register" and
 * "Fiduciary Governance" - the register you read, and the governance
 * that controls it. That split is kept because it is a real
 * distinction in this product and not a visual device: the first group
 * is the record, the second is who may change it and who signed it
 * off.
 *
 * THE LABELS ARE NOT THE EXPORT'S. "Statutory Register" and "Fiduciary
 * Governance" are the words of someone who already knows co-operative
 * accounting. The audience here is a resident who has never used an
 * accounting product, and every other label in this product was
 * rewritten into plain English for exactly that reason - `Disputes`
 * became `Questions` because a flag has no financial effect. A heading
 * a reader must decode is a heading that teaches them the product is
 * not for them.
 *
 * Derived from `navFor`, never a second hardcoded list: a list that
 * restates the items drifts from the role filtering the moment one
 * changes, and the failure is an item appearing for a role that cannot
 * use it.
 */
export interface NavGroup {
  readonly label: string
  readonly items: readonly NavItem[]
}

/** Governance surfaces: who approves, who signs, what gets published. */
const GOVERNANCE = new Set(['/approvals', '/sign-off', '/year-end', '/reports'])

export function navGroupsFor(role: Role): readonly NavGroup[] {
  const items = navFor(role)
  const record = items.filter((i) => !GOVERNANCE.has(i.to))
  const governance = items.filter((i) => GOVERNANCE.has(i.to))

  /*
   * An EMPTY GROUP IS DROPPED, not rendered as a heading over nothing.
   * A resident has no governance items at all, and a lone
   * "Approvals and sign-off" heading with no links under it reads as
   * something broken rather than something absent.
   */
  return [
    { label: 'The ledger', items: record },
    { label: 'Approvals and sign-off', items: governance },
  ].filter((g) => g.items.length > 0)
}
