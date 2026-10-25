import {
  BookOpen, CheckCheck, FileBarChart2, Flag, Gavel, Home, Landmark, PenLine, Users, Wallet,
} from 'lucide-react'
import type { Me } from './types'

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

/**
 * The bottom bar holds five. Anything carrying a count is promoted out of
 * More, so a pending obligation is never one tap deeper than it needs to be.
 */
export function splitTabs(items: NavItem[], badges: Partial<Record<NavId, number>>) {
  if (items.length <= 5) return { tabs: items, more: [] as NavItem[] }
  const keep = items.slice(0, 4)
  for (const it of items.slice(4)) {
    if ((badges[it.id] ?? 0) > 0 && keep.length < 4) keep.push(it)
    else if ((badges[it.id] ?? 0) > 0) {
      const i = [...keep].toReversed().findIndex((k) => k.id !== 'home' && !(badges[k.id] ?? 0))
      if (i >= 0) keep.splice(keep.length - 1 - i, 1, it)
    }
  }
  const tabs = items.filter((it) => keep.includes(it))
  return { tabs, more: items.filter((it) => !keep.includes(it)) }
}
