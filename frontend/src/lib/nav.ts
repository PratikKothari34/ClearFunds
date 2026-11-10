import {
  BookOpen, CheckCheck, FileBarChart2, Flag, Gavel, Home, Landmark, PenLine, Users, Wallet,
} from 'lucide-react'
import type { Me } from './types'
import { NO_COUNT, pressing, type BadgeCount } from './badge'

export type NavId = 'home' | 'ledger' | 'approvals' | 'dues' | 'flat' | 'disputes' | 'committee' | 'reports' | 'signoff' | 'yearend'

export type NavItem = { id: NavId; to: string; label: string; icon: typeof Home }

const ITEMS: Record<NavId, NavItem> = {
  home: { id: 'home', to: '/', label: 'Home', icon: Home },
  ledger: { id: 'ledger', to: '/ledger', label: 'Ledger', icon: BookOpen },
  approvals: { id: 'approvals', to: '/approvals', label: 'Approvals', icon: CheckCheck },
  dues: { id: 'dues', to: '/dues', label: 'Dues', icon: Wallet },
  flat: { id: 'flat', to: '/my-flat', label: 'My flat', icon: Landmark },
  disputes: { id: 'disputes', to: '/disputes', label: 'Disputes', icon: Flag },
  committee: { id: 'committee', to: '/committee', label: 'Committee', icon: Users },
  reports: { id: 'reports', to: '/reports', label: 'Reports', icon: FileBarChart2 },
  signoff: { id: 'signoff', to: '/sign-off', label: 'Sign-off', icon: PenLine },
  yearend: { id: 'yearend', to: '/year-end', label: 'Year-end', icon: Gavel },
}

/** Every surface this person may open, most-used first for their role. */
export function navFor(me: Me): NavItem[] {
  const role = me.seat?.role
  const order: NavId[] =
    role === 'president' ? ['home', 'signoff', 'approvals', 'disputes', 'ledger', 'dues', 'reports', 'committee']
    : role === 'treasurer' || role === 'secretary' ? ['home', 'ledger', 'approvals', 'dues', 'disputes', 'reports', 'committee']
    : role === 'member' ? ['home', 'ledger', 'approvals', 'disputes', 'dues', 'reports', 'committee']
    : me.auditor_for.length ? ['home', 'ledger', 'yearend', 'disputes', 'reports', 'committee']
    : me.tenure ? ['home', 'ledger', 'flat', 'disputes', 'reports', 'committee']
    : ['home', 'ledger', 'disputes', 'reports', 'committee']
  if (me.tenure && role && !order.includes('flat')) order.splice(order.length - 2, 0, 'flat')
  if (me.auditor_for.length && !order.includes('yearend')) order.splice(2, 0, 'yearend')
  return order.map((id) => ITEMS[id])
}

/*
 * The bottom bar shows four tabs plus a More button, five cells in all.
 * Anything carrying a count is promoted out of More, so a pending obligation
 * is never one tap deeper than it needs to be.
 *
 * `items` arrives from navFor already ordered most-used-first for this role,
 * and THAT ORDER IS THE PRIORITY. A badge promotes a surface past the items
 * below it, never past the items above it: a count is a reason to pull
 * something UP out of More, not a reason to push a more important surface
 * down into it.
 *
 * THREE BUGS THIS SHAPE EXISTS TO PREVENT, all found with no test in place.
 *
 * 1. The old code evicted by scanning `keep` for an item with no badge - but
 *    it scanned the ORIGINAL badge map while mutating `keep`, so a promoted
 *    item could itself be chosen as the next eviction.
 *
 * 2. `keep.length < 4` was dead: `keep` started as `items.slice(0, 4)`, so it
 *    was already 4 long and the condition could never hold. Every promotion
 *    went through the eviction path, including the ones that did not need to.
 *
 * 3. Both the old code AND the first rewrite of this function demoted
 *    **approvals** out of a treasurer's bar given `{reports: 3, committee: 2}`
 *    - two low-priority counts evicting the highest-priority surface in the
 *    product. The first rewrite did it by filling every slot from the pressing
 *    set before considering anything else, which is a different mechanism with
 *    the identical outcome: the treasurer's route to approving money moved one
 *    tap deeper because two notices arrived. Promotion is therefore bounded -
 *    it may only reach into the part of the list that was already in More.
 *
 * So: take the head by priority, then let pressing items compete for the
 * remaining slots. No mutation while deciding.
 */
export function splitTabs(items: NavItem[], badges: Partial<Record<NavId, BadgeCount>>) {
  const SLOTS = 4
  if (items.length <= SLOTS + 1) return { tabs: items, more: [] as NavItem[] }

  /*
   * An id with no entry in the map carries no obligation - useBadges only
   * writes the keys that apply to this person's role, so an absent key means
   * "this surface has no count", not "we failed to read it". That distinction
   * is why the default here is a known zero and NOT UNKNOWN: treating every
   * badgeless tab as unreadable would make everything pressing and the
   * promotion meaningless.
   */
  const isPressing = (it: NavItem) => pressing(badges[it.id] ?? NO_COUNT)

  /*
   * The head keeps its slots no matter what any badge says. It includes home,
   * which is where everything else hangs off, and it is what stops a count
   * from demoting a surface that matters more than the count does.
   *
   * One slot is held open for promotion. That is the whole budget: a bar of
   * four cells can surface at most one thing from More without taking a slot
   * from something the role needs more often.
   */
  const head = items.slice(0, SLOTS - 1)
  const tail = items.slice(SLOTS - 1)

  /*
   * The last slot goes to the first pressing item in the tail - "first" by the
   * role's own priority order, so of several waiting obligations the most
   * important one surfaces. With nothing pressing it simply goes to the next
   * item by priority, which is what the bar looks like with no badges at all.
   */
  const promoted = tail.find(isPressing) ?? tail[0]
  const chosen = promoted ? [...head, promoted] : head

  /*
   * Render in the role's own order, never in promotion order: the bar must not
   * reshuffle under someone as counts arrive.
   *
   * `chosen` happens to be in that order already - a prefix followed by one
   * item from the tail - so replacing this filter with `chosen` changes no
   * answer for any input, and NO BEHAVIOURAL TEST CAN KILL THAT MUTANT. It
   * stays because it is what makes the order a property of `items` rather than
   * of how `chosen` was assembled: the moment promotion picks two items, or
   * picks them out of order, `chosen` stops being sorted and this is the only
   * thing standing between that and a bar that reorders itself mid-tap.
   * `nav.test.ts` asserts the filter is present by reading this source.
   */
  const tabs = items.filter((it) => chosen.includes(it))
  return { tabs, more: items.filter((it) => !chosen.includes(it)) }
}
