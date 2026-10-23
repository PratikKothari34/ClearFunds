import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { BalanceBand } from './BalanceBand'
import { PeriodBand } from './PeriodBand'
import { RecentBand } from './RecentBand'
import { AttentionBand } from './AttentionBand'

/*
 * What the dashboard does when there is no data.
 *
 * This is the PRODUCTION path, not an edge case: the fixture is aliased
 * out of a production build, so `devDashboard()` returns null until the
 * endpoint exists, and `routes/index.tsx` turns that into every band's
 * `failed` prop. The placeholder values it passes alongside - a zero
 * balance, an empty period label - must never reach the screen, because
 * a zero balance is a claim about the society's money.
 *
 * The bands are asserted directly rather than through the route: the
 * route needs a mounted router, and the rule being locked down lives in
 * the bands. What the route contributes is only `absent || failed`,
 * which is covered by passing `failed` here. This file therefore lives
 * beside the bands and not in routes/, where the router plugin treats
 * every file as a route and warns about one that exports none.
 */

const ZERO = { minor: 0, currency: 'INR' }

describe('a band with no data', () => {
  it('never renders a zero balance', () => {
    const { container } = render(
      <BalanceBand balance={ZERO} asOf="" entryCount={0} failed />,
    )
    /*
     * The specific thing that must not appear. Rs 0.00 on the dashboard
     * of a society with money in the bank is worse than an error: it is
     * a wrong figure that looks like a right one, which is the failure
     * mode this project names as its worst.
     */
    expect(container.textContent).not.toContain('0.00')
    expect(container.textContent).toContain("Couldn't load the balance")
  })

  it('says nothing has moved, so a resident does not read it as a loss', () => {
    const { container } = render(
      <BalanceBand balance={ZERO} asOf="" entryCount={0} failed />,
    )
    expect(container.textContent).toContain('no money has moved')
  })

  it('never renders an empty period label as a period', () => {
    const { container } = render(
      <PeriodBand
        period={{ label: '', inflow: ZERO, outflow: ZERO }}
        failed
      />,
    )
    expect(container.textContent).not.toContain('0.00')
  })

  it('does not claim the history is empty when it failed to load', () => {
    /*
     * The distinction the design calls out: an empty list means "nothing
     * here", a failed fetch means "we do not know". A society with no
     * entries and a society whose entries did not load must not render
     * the same.
     */
    const failedText = render(<RecentBand entries={[]} failed />).container
      .textContent
    const emptyText = render(<RecentBand entries={[]} />).container.textContent
    expect(failedText).not.toEqual(emptyText)
  })

  it('does not claim nothing needs you when the fetch failed', () => {
    // Same rule on the attention band, where it matters most: "nothing
    // needs you" is the sentence a committee would most like to see and
    // the one least safe to guess at.
    const failedText = render(<AttentionBand items={[]} failed />).container
      .textContent
    const emptyText = render(<AttentionBand items={[]} />).container.textContent
    expect(failedText).not.toEqual(emptyText)
  })
})
