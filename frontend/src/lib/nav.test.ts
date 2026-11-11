import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NO_COUNT, UNKNOWN, type BadgeCount } from './badge'
import { navFor, splitTabs, type NavId, type NavItem } from './nav'
import { ROLE_ORDER, type Me, type Role } from './types'

/*
 * `nav.ts` had NO test file at all - 54 lines deciding which surfaces a person
 * can reach and which of them reach the bottom bar - and it carried two live
 * defects, both found by tracing it rather than reading it:
 *
 *   1. The eviction scanned the ORIGINAL badge map while mutating `keep`, so a
 *      just-promoted item could be chosen as the next eviction. With counts on
 *      `reports` and `committee`, a treasurer LOST `approvals` from the bar -
 *      the function buried the highest-priority surface in the product to
 *      surface two lower-priority ones, the exact opposite of its docstring.
 *   2. `keep.length < 4` was dead: `keep` began as `items.slice(0, 4)`.
 *
 * So the assertions below are about the RULES, never about a tab count or a
 * sample badge figure: a count that is waiting is never demoted; home always
 * keeps its slot; the bar never reshuffles under someone.
 */

const SOCIETY: Me['society'] = {
  id: 's', name: 'Test CHS', city: null, currency: 'INR', currency_exponent: 2,
} as Me['society']

function me(over: Partial<Me> = {}): Me {
  return {
    person: 'p', name: 'A', email: 'a@b.c', society: SOCIETY,
    seat: null, auditor_for: [], tenure: null, last_seen_seq: null,
    ...over,
  }
}

const seated = (role: Role): Me => me({ seat: { role, derived: false } })
const ids = (items: NavItem[]) => items.map((i) => i.id)
const count = (n: number): BadgeCount => ({ known: true, n })

/** Every id reachable at all, for whichever role, so a split can be checked. */
function split(items: NavItem[], badges: Partial<Record<NavId, BadgeCount>>) {
  const { tabs, more } = splitTabs(items, badges)
  return { tabs: ids(tabs), more: ids(more) }
}

describe('navFor(): what each person can reach', () => {
  it('offers home and the ledger to everyone, in every seat', () => {
    /*
     * Driven from ROLE_ORDER rather than a literal list, so a fifth role added
     * to the contract fails here instead of being quietly untested.
     */
    for (const role of ROLE_ORDER) {
      const got = ids(navFor(seated(role)))
      expect(got, role).toContain('home')
      expect(got, role).toContain('ledger')
      expect(got[0], role).toBe('home')
    }
    for (const person of [me(), me({ auditor_for: ['2025-26'] })]) {
      expect(ids(navFor(person))).toContain('ledger')
    }
  })

  it('never offers a surface twice', () => {
    const people = [
      ...ROLE_ORDER.map(seated),
      me(),
      me({ auditor_for: ['2025-26'] }),
      me({ tenure: { id: 't' } as Me['tenure'] }),
      me({ seat: { role: 'treasurer', derived: false }, tenure: { id: 't' } as Me['tenure'] }),
      me({ seat: { role: 'member', derived: false }, auditor_for: ['2025-26'] }),
    ]
    for (const p of people) {
      const got = ids(navFor(p))
      expect(new Set(got).size, got.join(',')).toBe(got.length)
    }
  })

  it('gives the sign-off surface to the president and to nobody else', () => {
    expect(ids(navFor(seated('president')))).toContain('signoff')
    for (const role of ROLE_ORDER.filter((r) => r !== 'president')) {
      expect(ids(navFor(seated(role))), role).not.toContain('signoff')
    }
    expect(ids(navFor(me()))).not.toContain('signoff')
  })

  it('gives year-end to an auditor, including one who also holds a seat', () => {
    expect(ids(navFor(me({ auditor_for: ['2025-26'] })))).toContain('yearend')
    expect(ids(navFor(me({ seat: { role: 'member', derived: false }, auditor_for: ['2025-26'] })))).toContain('yearend')
    expect(ids(navFor(me()))).not.toContain('yearend')
  })

  it('keeps disputes out of a pure auditor’s nav, and in everyone else’s', () => {
    /*
     * A dispute is a resident questioning the committee. The auditor is not a
     * party to it - he cannot raise one and cannot resolve one - so the tab
     * would put other people's grievances in his nav and imply they are his
     * to act on.
     *
     * ASSERTED BOTH WAYS ON PURPOSE. Dropping the id from every branch of
     * `navFor` would satisfy a one-sided "auditor has no disputes" test
     * while silently removing the surface from the residents whose product
     * it is, so each other role is named here too.
     *
     * The seat-holding auditor KEEPS it: the exclusion follows from having no
     * seat and no tenure, not from the auditor flag - a committee member who
     * is also an auditor is still a party to the dispute as a member. That is
     * also why this is a nav decision and not access control: `/disputes`
     * stays reachable and read-only for him, because the server owns the row
     * filter and a hidden nav link has never refused anybody.
     */
    expect(ids(navFor(me({ auditor_for: ['2025-26'] })))).not.toContain('disputes')

    for (const role of ROLE_ORDER) {
      expect(ids(navFor(seated(role))), role).toContain('disputes')
    }
    expect(ids(navFor(me({ tenure: { id: 't' } as Me['tenure'] })))).toContain('disputes')
    expect(ids(navFor(me()))).toContain('disputes')
    expect(
      ids(navFor(me({ seat: { role: 'member', derived: false }, auditor_for: ['2025-26'] }))),
    ).toContain('disputes')
  })

  it('gives the flat surface only to someone with a tenure', () => {
    const tenure = { id: 't' } as Me['tenure']
    expect(ids(navFor(me({ tenure })))).toContain('flat')
    expect(ids(navFor(me({ seat: { role: 'treasurer', derived: false }, tenure })))).toContain('flat')
    expect(ids(navFor(me()))).not.toContain('flat')
    expect(ids(navFor(seated('treasurer')))).not.toContain('flat')
  })
})

describe('splitTabs(): a waiting obligation is never pushed into More', () => {
  const treasurer = navFor(seated('treasurer'))

  it('leaves room for the More button, which the bar must always carry', () => {
    /*
     * The bottom bar has five cells and the fifth is More. So a split that
     * returns more than four tabs has no cell left for the button and the
     * surfaces in `more` become unreachable on a phone - and a split that
     * returns fewer wastes a cell that a role with more surfaces needs.
     *
     * Asserted against the CELLS, not against a baseline from this same
     * function: comparing one splitTabs result to another cannot notice that
     * both are the wrong size, which is how a smaller bar went unseen.
     */
    const CELLS = 5
    for (const person of [...ROLE_ORDER.map(seated), me({ auditor_for: ['2025-26'] })]) {
      const items = navFor(person)
      const label = person.seat?.role ?? 'auditor'
      const { tabs, more } = splitTabs(items, {})
      if (more.length === 0) {
        // Nothing was demoted, so no More button is needed and every surface
        // may take a cell of its own.
        expect(tabs.length, label).toBeLessThanOrEqual(CELLS)
      } else {
        expect(tabs.length, label).toBe(CELLS - 1)
      }
    }
  })

  it('keeps the bar one size whatever the badges say, so it never reshuffles', () => {
    /*
     * Not an assertion on the number 4 as a magic figure: the rule is that the
     * bar's SHAPE does not depend on the counts, because a bar that resized or
     * reordered as reads landed would move a tab under a finger already on its
     * way down.
     */
    const base = splitTabs(treasurer, {})
    for (const badges of [
      { approvals: count(5) },
      { reports: count(3), committee: count(2) },
      { approvals: count(5), reports: count(3), committee: count(2) },
      { dues: UNKNOWN },
    ] satisfies Partial<Record<NavId, BadgeCount>>[]) {
      const got = splitTabs(treasurer, badges)
      expect(got.tabs.length, JSON.stringify(badges)).toBe(base.tabs.length)
      expect(got.tabs.length + got.more.length).toBe(treasurer.length)
    }
  })

  it('a low-priority count never demotes a higher-priority surface', () => {
    /*
     * THE REGRESSION, and it survived the first rewrite of splitTabs as well
     * as the original: both answered `home,ledger,reports,committee` here,
     * pushing a treasurer's `approvals` - the route to approving money - one
     * tap deeper because two low-priority notices arrived.
     */
    const base = split(treasurer, {})
    const { tabs, more } = split(treasurer, { reports: count(3), committee: count(2) })
    for (const id of base.tabs.slice(0, 3)) {
      expect(tabs, id).toContain(id)
      expect(more, id).not.toContain(id)
    }
    expect(tabs).toContain('reports') // the most important pressing one is surfaced
  })

  it('never demotes anything the unbadged bar already held, for any badges', () => {
    /*
     * The general form, swept over every pair of the role's own surfaces. The
     * head of the bar is fixed by the role's priority order; a badge may only
     * reach into the part of the list that was ALREADY in More.
     */
    const base = split(treasurer, {})
    const fixed = base.tabs.slice(0, 3)
    const promotable = ids(treasurer).filter((id) => id !== 'home')
    for (const a of promotable) {
      for (const b of promotable) {
        if (a === b) continue
        const badges = { [a]: count(1), [b]: count(1) } as Partial<Record<NavId, BadgeCount>>
        const { tabs, more } = split(treasurer, badges)
        for (const id of fixed) {
          expect(tabs, `${a}+${b} must keep ${id}`).toContain(id)
          expect(more, `${a}+${b} must keep ${id}`).not.toContain(id)
        }
      }
    }
  })

  it('surfaces the most important waiting obligation, not the last one seen', () => {
    /*
     * Only one slot is available for promotion, so WHICH pressing item gets it
     * is a decision. It must be the highest-priority one for this role - a
     * `findLast`, or iterating the badge map's own key order, would surface
     * whichever count happened to be written last instead.
     */
    const order = ids(treasurer)
    const base = split(treasurer, {})
    const inMore = base.more
    expect(inMore.length).toBeGreaterThan(1)
    const [earlier, later] = [inMore[0]!, inMore.at(-1)!]
    expect(order.indexOf(earlier)).toBeLessThan(order.indexOf(later))

    const { tabs } = split(treasurer, {
      [earlier]: count(1), [later]: count(9),
    } as Partial<Record<NavId, BadgeCount>>)
    // The bigger number on the less important surface must not win.
    expect(tabs).toContain(earlier)
    expect(tabs).not.toContain(later)
  })

  it('home keeps its slot even when everything else is badged', () => {
    const badges = Object.fromEntries(
      ids(treasurer).filter((id) => id !== 'home').map((id) => [id, count(9)]),
    ) as Partial<Record<NavId, BadgeCount>>
    const { tabs, more } = split(treasurer, badges)
    expect(tabs).toContain('home')
    expect(more).not.toContain('home')
  })

  it('renders in the role order, never in promotion order', () => {
    // A bar that re-sorted itself by which count arrived first would move a
    // target under a finger mid-tap.
    const order = ids(treasurer)
    for (const badges of [
      {},
      { committee: count(2) },
      { reports: count(3), committee: count(2) },
      { committee: UNKNOWN },
    ] satisfies Partial<Record<NavId, BadgeCount>>[]) {
      const { tabs, more } = split(treasurer, badges)
      const positions = tabs.map((id) => order.indexOf(id))
      expect(positions, JSON.stringify(badges)).toEqual([...positions].sort((x, y) => x - y))
      // The two halves partition the role's surfaces with nothing lost or
      // duplicated - a filter-based split can drop an item silently.
      expect([...tabs, ...more].sort()).toEqual([...order].sort())
    }
  })

  it('an unreadable count is promoted exactly like a real one', () => {
    /*
     * We do not know that nothing waits there, so letting it sink a tap deeper
     * is the same mistake as rendering no badge.
     */
    const low = ids(treasurer).at(-1)!
    const { tabs } = split(treasurer, { [low]: UNKNOWN } as Partial<Record<NavId, BadgeCount>>)
    expect(tabs).toContain(low)
  })

  it('an absent key is a known zero, not an unknown count', () => {
    /*
     * If an absent key defaulted to UNKNOWN, EVERY tab would be pressing and
     * the promotion would stop choosing anything - the split would collapse to
     * "the first four", which is what it does with no badges at all. So an
     * explicit all-zero map must give the same answer as an empty one, while
     * an explicit all-unknown map must not be what a no-badge bar looks like.
     */
    const explicitZero = Object.fromEntries(
      ids(treasurer).map((id) => [id, NO_COUNT]),
    ) as Partial<Record<NavId, BadgeCount>>
    expect(split(treasurer, explicitZero)).toEqual(split(treasurer, {}))
  })

  it('shows a resident every surface, with no More button at all', () => {
    /*
     * THE BOUNDARY, and the one role that sits exactly on it: a resident has
     * five surfaces and the bar has five cells, so all five fit and no More
     * button is needed. An off-by-one in the short-list guard hides the fifth
     * behind a button for the product's largest audience - and it is invisible
     * to every other role, whose lists are 6-8 long and always split.
     */
    const items = navFor(me())
    const { tabs, more } = split(items, {})
    expect(tabs).toEqual(ids(items))
    expect(more).toEqual([])
  })

  it('shows every surface when a list is shorter still, badges or not', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const short = navFor(seated('treasurer')).slice(0, n)
      for (const badges of [{}, { ledger: count(4) }, { ledger: UNKNOWN }]) {
        const { tabs, more } = split(short, badges as Partial<Record<NavId, BadgeCount>>)
        expect(tabs, `n=${n}`).toEqual(ids(short))
        expect(more, `n=${n}`).toEqual([])
      }
    }
  })

  it('splits as soon as a list cannot fit the cells', () => {
    // One past the boundary: the sixth surface forces a More button, and the
    // bar gives up a cell for it rather than dropping a surface entirely.
    //
    // THE SIX IS THE BOUNDARY, NOT A ROLE'S LENGTH. This read
    // `navFor(auditor)` and asserted it returned 6 - so removing Disputes
    // from the auditor's nav (5 items, which fit) failed this test, which is
    // about splitTabs and not about auditors at all. Worse, the reverse
    // drift is silent: had some role grown to 7, the test would still pass
    // while no longer exercising the first overflow. Take the longest role
    // and slice to the boundary, so the case under test is the boundary
    // itself whatever any role happens to carry.
    const items = navFor(seated('president')).slice(0, 6)
    expect(items.length).toBe(6)
    const { tabs, more } = split(items, {})
    expect(more.length).toBeGreaterThan(0)
    expect(tabs.length).toBe(4)
    expect([...tabs, ...more].sort()).toEqual([...ids(items)].sort())
  })

  it('derives the rendered order from `items`, not from the promotion order', () => {
    /*
     * AN UNKILLABLE MUTANT, STATED. `chosen` is built as a prefix plus one
     * item from the tail, so it is already in the role's order and
     * `tabs = chosen` returns the same array as the filter for EVERY input -
     * no behavioural test can tell the two apart, and the mutation run
     * confirms it survives all 29 cases.
     *
     * The filter still has to be there: it makes the order a property of
     * `items`, so the first change that promotes two surfaces, or promotes out
     * of order, does not silently ship a bar that reorders itself under a
     * finger. Since the decision is the expression and not any answer, the
     * only thing left to assert is the source.
     *
     * Comments are stripped first because the prose above names every
     * identifier. Measured honestly: the strip is NOT what kills the mutant
     * today - the negative arm does that on its own - but it is what keeps the
     * positive arm from being satisfied by a comment that merely mentions
     * `items.filter`, which is how a source guard goes quietly dead.
     */
    const src = readFileSync(join(import.meta.dirname, 'nav.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(src).toMatch(/const\s+tabs\s*=\s*items\.filter\(/)
    expect(src).not.toMatch(/const\s+tabs\s*=\s*chosen\b/)
  })

  it('leaves the array it was handed untouched', () => {
    // The old implementation mutated while deciding; `items` comes straight
    // from navFor and is rendered by the rail beside the bar.
    const items = navFor(seated('president'))
    const before = ids(items)
    splitTabs(items, { disputes: count(1), reports: count(2) })
    expect(ids(items)).toEqual(before)
  })

  it('holds for every role, not just the treasurer', () => {
    for (const person of [
      ...ROLE_ORDER.map(seated),
      me({ auditor_for: ['2025-26'] }),
      me({ tenure: { id: 't' } as Me['tenure'] }),
    ]) {
      const items = navFor(person)
      const label = person.seat?.role ?? (person.auditor_for.length ? 'auditor' : 'resident')
      const base = split(items, {})
      const badged = ids(items).filter((id) => id !== 'home').slice(-2)
      const badges = Object.fromEntries(badged.map((id) => [id, count(1)])) as Partial<Record<NavId, BadgeCount>>
      const { tabs, more } = split(items, badges)

      expect(tabs, label).toContain('home')
      // Nothing the unbadged bar held is lost, whatever arrives.
      for (const id of base.tabs.slice(0, 3)) {
        expect(tabs, `${label} must keep ${id}`).toContain(id)
      }
      /*
       * With only one slot to give, at least one badged surface reaches the
       * bar - and, where a bar exists at all, it is the more important of the
       * two. Asserting BOTH would be asserting the defect: it is what demotes
       * a priority surface to make room for a second notice.
       */
      if (more.length > 0) {
        const promoted = badged.filter((id) => tabs.includes(id))
        expect(promoted.length, label).toBeGreaterThan(0)
        expect(promoted[0], label).toBe(badged[0])
      } else {
        expect(tabs, label).toEqual(ids(items))
      }
      expect([...tabs, ...more].sort(), label).toEqual([...ids(items)].sort())
    }
  })
})
