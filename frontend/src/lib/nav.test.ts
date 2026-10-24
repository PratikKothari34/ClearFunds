import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEDGER_TABS, MOBILE_TAB_MAX, navFor, splitForMobile } from './nav'
import { canSeeAllDues, canSeeApprovalQueue } from './identity'
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

/*
 * THE NAV AND THE PERMISSIONS MUST NOT DISAGREE.
 *
 * This file's own header says role filtering here is cosmetic, which is
 * true of the direction that matters for security: a hidden item is not
 * a permission check, and the server must refuse the surface anyway.
 *
 * The OTHER direction is not cosmetic at all, and had nothing watching
 * it. The president's items omitted Dues while `canSeeAllDues` already
 * granted it to them, and omitted Ledger entirely - so the one role
 * asked to put their name on a month's figures had no link to the
 * history behind them. Every existing test here passed before and after
 * that fix, because each asserted a property of the lists rather than
 * their agreement with the predicates.
 */
describe('the nav offers what the role is entitled to', () => {
  it('links Dues for every role that may see all of it', () => {
    for (const r of ROLES) {
      const tos = navFor(r).map((i) => i.to)
      expect(tos.includes('/dues'), `${r}`).toBe(canSeeAllDues(r))
    }
  })

  it('links Approvals exactly for the roles with business there', () => {
    for (const r of ROLES) {
      const tos = navFor(r).map((i) => i.to)
      expect(tos.includes('/approvals'), `${r}`).toBe(canSeeApprovalQueue(r))
    }
  })

  it('gives the ledger to every role that approves or signs', () => {
    /*
     * Derived from the two predicates rather than listed, so a role
     * added later cannot be given an approval power and no history to
     * exercise it against. Signing or approving a figure without being
     * able to open the entries behind it is the gap this catches.
     */
    for (const r of ROLES) {
      if (!canSeeApprovalQueue(r)) continue
      expect(navFor(r).map((i) => i.to), `${r}`).toContain('/ledger')
    }
  })

  it('gives My flat only to the role that has one', () => {
    // A treasurer or auditor has no flat in this product's model, so
    // the item would open a page that tells them no flat is linked.
    for (const r of ROLES) {
      const tos = navFor(r).map((i) => i.to)
      expect(tos.includes('/my-flat'), `${r}`).toBe(r === 'resident')
    }
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

describe('the navigation speaks the pages’ vocabulary', () => {
  /*
   * ONE WORD PER CONCEPT, ACROSS NAV AND PAGE.
   *
   * The nav said `Disputes` and `Flagged` while every page under both
   * said "question", and the ledger tab said `Reversed` over rows that
   * render the word "cancelled". Three vocabularies for two concepts,
   * for an audience that has never used an accounting product. Nothing
   * failed, because nothing was comparing the two halves - the nav
   * tests asserted ordering and counts, never words.
   *
   * These read the real route sources, so the nav cannot drift from
   * the copy without going red.
   */
  const routeSource = (file: string) =>
    readFileSync(resolve('src/routes', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\/[^\n]*/g, '')

  const labels = () => [
    ...navFor('resident').map((i) => i.label),
    ...navFor('treasurer').map((i) => i.label),
    ...LEDGER_TABS.map((t) => t.label),
  ]

  it('never calls a resident’s question a dispute', () => {
    /*
     * Not register, substance: a flag has no financial effect.
     * "Dispute" tells the resident, and the committee reading the
     * badge, that something has been escalated - which discourages
     * the asking the ledger exists to invite.
     */
    for (const label of labels()) {
      expect(label.toLowerCase()).not.toContain('dispute')
      expect(label.toLowerCase()).not.toContain('flag')
    }
  })

  it('uses the word the questions page itself uses', () => {
    const page = routeSource('disputes.tsx')
    expect(page).toMatch(/question/i)
    const all = labels().map((l) => l.toLowerCase())
    expect(all).toContain('questions')
  })

  it('labels the cancelled tab the way the rows label themselves', () => {
    /*
     * EntryRow renders `Cancelled` - in <s> and again visually hidden
     * - so a tab reading `Reversed` over those rows leaves a resident
     * checking whether they are in the right list.
     */
    const row = readFileSync(resolve('src/components/Cancelled.tsx'), 'utf8')
    expect(row.toLowerCase()).toContain('cancelled')
    const tab = LEDGER_TABS.find((t) => t.to === '/ledger/reversed')
    expect(tab?.label.toLowerCase()).toBe('cancelled')
    for (const t of LEDGER_TABS) {
      expect(t.label.toLowerCase()).not.toContain('reversed')
    }
  })

  it('keeps the paths unchanged, because a path is a shared link', () => {
    /*
     * A resident pastes /ledger/reversed into the society's WhatsApp
     * group, and TanStack file routing makes the filename the route -
     * so renaming the path breaks every link already sent. Relabelling
     * must not become renaming.
     */
    expect(LEDGER_TABS.map((t) => t.to)).toEqual([
      '/ledger',
      '/ledger/reversed',
      '/ledger/flagged',
    ])
    expect(navFor('resident').map((i) => i.to)).toContain('/disputes')
  })
})
