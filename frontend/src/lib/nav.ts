import type { Role } from './types'

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
  /** Items carrying a live count are promoted out of `More` on mobile. */
  readonly countable?: boolean
  /** Never demoted to `More`, whatever the count. */
  readonly pinned?: boolean
}

const HOME: NavItem = { to: '/', label: 'Home', pinned: true }
const LEDGER: NavItem = { to: '/ledger', label: 'Ledger' }
const DISPUTES: NavItem = { to: '/disputes', label: 'Disputes', countable: true }
const APPROVALS: NavItem = {
  to: '/approvals',
  label: 'Approvals',
  countable: true,
}
const REPORTS: NavItem = { to: '/reports', label: 'Reports' }
const DUES: NavItem = { to: '/dues', label: 'Dues' }
const MY_FLAT: NavItem = { to: '/my-flat', label: 'My flat' }
const SIGNOFF: NavItem = {
  to: '/sign-off',
  label: 'Sign-off',
  countable: true,
  pinned: true,
}
const YEAR_END: NavItem = { to: '/year-end', label: 'Year-end' }

const BY_ROLE: Record<Role, readonly NavItem[]> = {
  // The resident keeps four items, so the surface this audience uses most
  // stays the simplest thing in the product.
  resident: [HOME, LEDGER, MY_FLAT, DISPUTES],
  treasurer: [HOME, LEDGER, APPROVALS, DISPUTES, DUES, REPORTS],
  secretary: [HOME, LEDGER, APPROVALS, DISPUTES, DUES, REPORTS],
  committee: [HOME, LEDGER, APPROVALS, DISPUTES, REPORTS],
  // Sign-off is the president's job and is never demoted.
  president: [HOME, SIGNOFF, APPROVALS, DISPUTES, REPORTS],
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

/** Second-level tabs within the ledger. Never a nested menu. */
export const LEDGER_TABS = [
  { to: '/ledger', label: 'All' },
  { to: '/ledger/reversed', label: 'Reversed' },
  { to: '/ledger/flagged', label: 'Flagged' },
] as const
