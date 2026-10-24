import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NavBadge, BADGE_CAP } from './NavBadge'
import { BalanceBand } from './dashboard/BalanceBand'

/*
 * RENDERED, NOT GREPPED.
 *
 * A sibling guard in `countable.test.ts` reads these files' source and
 * forbids the spellings that let a NaN count through. It is worth
 * having and it is not sufficient: mutation testing walked past two
 * versions of it in a row - first `(count as number) > 0`, where a cast
 * sits between the identifier and the operator, then `Number(count) >
 * 0` and bare truthiness, which are coercions rather than comparisons
 * and so match no comparison pattern at all. Each time the fix was a
 * wider regex, and the next evasion was one more cast away.
 *
 * So the rule is asserted by OUTCOME here: whatever the code says,
 * nothing that is not a count may reach the screen as one. That is what
 * was actually promised, and it cannot be evaded by rewriting the
 * condition.
 */

/*
 * The values a count arrives as when something upstream went wrong.
 * NaN is the dangerous one, because every ordering comparison against
 * it is false AND `?? 0` does not catch it, so the two obvious guards
 * both miss it.
 */
const notCounts = [
  ['NaN', NaN],
  ['NaN from arithmetic', 0 - Number(undefined)],
  ['zero', 0],
  ['negative', -3],
  ['fraction', 2.5],
  ['Infinity', Infinity],
  ['undefined', undefined],
  ['null', null],
  ['numeric string', '3'],
] as const

describe('NavBadge shows nothing that is not a count', () => {
  it('renders a usable count, which is the control', () => {
    // First, so that the absence assertions below mean something: if
    // the component rendered nothing for everything, they would all
    // pass vacuously.
    const { container } = render(<NavBadge count={3} label="Approvals" />)
    expect(container.textContent).toMatch(/3/)
    expect(container.textContent).toMatch(/items need you in Approvals/)
  })

  it('caps a large count rather than printing it', () => {
    const { container } = render(
      <NavBadge count={BADGE_CAP + 7} label="Approvals" />,
    )
    expect(container.textContent).toMatch(new RegExp(`${BADGE_CAP}\\+`))
    expect(container.textContent).not.toMatch(String(BADGE_CAP + 7))
  })

  it('renders nothing at all for anything that is not a count', () => {
    for (const [label, value] of notCounts) {
      const { container, unmount } = render(
        <NavBadge count={value} label="Approvals" />,
      )
      /*
       * EMPTY, not "no NaN". A badge that rendered an empty bubble, or
       * announced "items need you in Approvals" with no figure, would
       * pass a check for the string "NaN" while still putting a
       * notification on screen for a count nobody has.
       */
      expect(container.textContent, label).toBe('')
      expect(container.querySelector('span'), label).toBeNull()
      unmount()
    }
  })

  it('never puts the word NaN on screen or in the announcement', () => {
    for (const [label, value] of notCounts) {
      const { container, unmount } = render(
        <NavBadge count={value} label="Approvals" />,
      )
      expect(container.textContent, label).not.toMatch(/NaN|undefined|null/i)
      unmount()
    }
  })
})

describe('BalanceBand keeps a bad count away from the balance', () => {
  const balance = { minor: 125075, currency: 'INR' } as const

  it('shows the count when it is one, which is the control', () => {
    const { container } = render(
      <BalanceBand
        balance={balance}
        asOf="2026-10-21T09:00:00+05:30"
        entryCount={848}
      />,
    )
    expect(container.textContent).toMatch(/848/)
    expect(container.textContent).toMatch(/entries/)
  })

  it('says one entry in the singular', () => {
    const { container } = render(
      <BalanceBand
        balance={balance}
        asOf="2026-10-21T09:00:00+05:30"
        entryCount={1}
      />,
    )
    expect(container.textContent).toMatch(/1 entry/)
    expect(container.textContent).not.toMatch(/entries/)
  })

  it('drops the count but keeps the balance when the count is unusable', () => {
    for (const [label, value] of notCounts) {
      const { container, unmount } = render(
        <BalanceBand
          balance={balance}
          asOf="2026-10-21T09:00:00+05:30"
          entryCount={value as number}
        />,
      )
      const text = container.textContent ?? ''
      /*
       * THE BALANCE STILL SHOWS. This band's own rule is that it never
       * collapses: the count is context for situating the figure, so
       * losing the context is not a reason to withhold the one number
       * most of this product's audience opens the app to read.
       */
      expect(text, `${label}: balance missing`).toMatch(/1,250\.75/)
      expect(text, `${label}: bad count reached the screen`).not.toMatch(
        /NaN|undefined|null|Infinity/i,
      )
      // And no stranded unit, which would read as a quantity of zero.
      expect(text, `${label}: stranded unit`).not.toMatch(/\bentr(y|ies)\b/)
      unmount()
    }
  })
})
