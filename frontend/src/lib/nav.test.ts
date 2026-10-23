import { describe, expect, it } from 'vitest'
import { MOBILE_TAB_MAX, navFor, splitForMobile } from './nav'
import type { NavItem } from './nav'
import type { Role } from './types'

const ROLES: Role[] = [
  'president',
  'treasurer',
  'secretary',
  'committee',
  'resident',
  'auditor',
]

describe('navFor', () => {
  it('covers all six roles', () => {
    for (const r of ROLES) expect(navFor(r).length).toBeGreaterThan(0)
  })

  it('never offers Verify as a nav item', () => {
    // Promoting Verify to the bar tells every resident on every screen
    // that doubt is a normal state. It is reached from the fingerprint
    // band and from an entry's detail sheet instead.
    for (const r of ROLES) {
      expect(navFor(r).map((i) => i.to)).not.toContain('/verify')
    }
  })

  it('starts every role at Home', () => {
    for (const r of ROLES) expect(navFor(r)[0]?.to).toBe('/')
  })

  it('keeps the resident at four items', () => {
    expect(navFor('resident')).toHaveLength(4)
  })

  it('gives a resident no approval or reporting surface', () => {
    const tos = navFor('resident').map((i) => i.to)
    expect(tos).not.toContain('/approvals')
    expect(tos).not.toContain('/sign-off')
    expect(tos).not.toContain('/reports')
    expect(tos).not.toContain('/dues')
  })

  it('gives the president sign-off and the auditor year-end', () => {
    expect(navFor('president').map((i) => i.to)).toContain('/sign-off')
    expect(navFor('auditor').map((i) => i.to)).toContain('/year-end')
  })

  it('does not give the auditor an approval surface', () => {
    // The auditor gives reasonable assurance; he does not move money.
    expect(navFor('auditor').map((i) => i.to)).not.toContain('/approvals')
  })
})

describe('splitForMobile', () => {
  it('leaves a short list alone', () => {
    const items = navFor('resident')
    const { tabs, more } = splitForMobile(items)
    expect(tabs).toEqual(items)
    expect(more).toEqual([])
  })

  it('caps the bar and keeps a slot for More', () => {
    const { tabs, more } = splitForMobile(navFor('treasurer'))
    expect(tabs.length).toBeLessThanOrEqual(MOBILE_TAB_MAX - 1)
    expect(more.length).toBeGreaterThan(0)
  })

  it('promotes an item out of More once it carries a count', () => {
    // A badge inside a collapsed menu is a notification nobody sees.
    //
    // Built here rather than taken from a role: promotion is only
    // observable on an item that lands in `More` without a count, and no
    // role's list happens to put one there. Testing a role's accidental
    // composition would assert nothing.
    const items: NavItem[] = [
      { to: '/', label: 'Home', pinned: true },
      { to: '/a', label: 'A' },
      { to: '/b', label: 'B' },
      { to: '/c', label: 'C' },
      { to: '/d', label: 'D' },
      { to: '/e', label: 'E' },
    ]

    const without = splitForMobile(items)
    expect(without.more.map((i) => i.to)).toContain('/e')

    const withCount = splitForMobile(items, { '/e': 3 })
    expect(withCount.tabs.map((i) => i.to)).toContain('/e')
    expect(withCount.more.map((i) => i.to)).not.toContain('/e')
  })

  it('ranks by a live count, not by the countable flag', () => {
    // The flag says an item CAN carry a badge, which is true of several
    // and so cannot order them. An item with nothing pending has no claim
    // on a tab slot over one that does.
    const items: NavItem[] = [
      { to: '/', label: 'Home', pinned: true },
      { to: '/a', label: 'A', countable: true },
      { to: '/b', label: 'B', countable: true },
      { to: '/c', label: 'C', countable: true },
      { to: '/d', label: 'D' },
      { to: '/e', label: 'E' },
    ]

    const { tabs } = splitForMobile(items, { '/e': 2 })
    expect(tabs.map((i) => i.to)).toContain('/e')
  })

  it('never demotes a pinned item', () => {
    const items = navFor('president')
    // Pile counts onto everything else and sign-off must still be a tab.
    const counts = Object.fromEntries(
      items.filter((i) => !i.pinned).map((i) => [i.to, 9]),
    )
    const { tabs } = splitForMobile(items, counts)
    expect(tabs.map((i) => i.to)).toContain('/sign-off')
    expect(tabs.map((i) => i.to)).toContain('/')
  })

  it('keeps declaration order, so the bar does not reshuffle', () => {
    const items = navFor('treasurer')
    const { tabs } = splitForMobile(items, { '/reports': 2 })
    const order = tabs.map((i) => items.indexOf(i))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('loses no item: every entry is in exactly one group', () => {
    for (const r of ROLES) {
      const items = navFor(r)
      const { tabs, more } = splitForMobile(items, { '/disputes': 1 })
      expect([...tabs, ...more].map((i) => i.to).sort()).toEqual(
        items.map((i) => i.to).sort(),
      )
    }
  })
})
