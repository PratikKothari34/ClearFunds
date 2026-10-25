import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { BalanceBand } from './BalanceBand'
import type { AnchorStatus, Money } from '../../lib/types'

/**
 * The balance and the published-record check render as ONE block
 * (2026-10-25). Two requirements came with that merge, and both are the
 * kind that stay green while silently breaking:
 *
 *   1. EACH HALF FAILS ALONE. A loaded balance must render while the
 *      anchor is pending, failed or absent, and the provenance must
 *      render when the balance is fine. Coupling them would turn two
 *      honest partial answers into one missing section, and no existing
 *      test would have caught it - the whole dashboard was merged from
 *      five bands to four with 479 tests passing.
 *
 *   2. THE MISMATCH IS READ BEFORE THE FIGURE. Its own copy ends "do
 *      not rely on the figures above", which is false if the warning
 *      renders below the number. So this asserts DOCUMENT ORDER, not
 *      merely that both strings exist.
 *
 * Assertions are on the rule, never on a fixture's digits: the amount
 * and the dates below are arbitrary, and an assertion like `=== 3` gets
 * "fixed" by editing the expected number, which deletes the test's
 * meaning while leaving it green.
 */

afterEach(cleanup)

const BALANCE: Money = { minor: 48235000, currency: 'INR' }
const AS_OF = '2026-10-22T09:00:00+05:30'
const PUBLISHED = '2026-10-22T04:00:00+05:30'
const SOURCE = 'example.invalid'

/** The sentence whose placement is load-bearing. */
const WARNING = 'does not match the published record'
/** Proves the balance half rendered, without naming a formatted amount. */
const BALANCE_LABEL = 'Money the society holds'

function mount(ui: ReactNode) {
  const root = createRootRoute({ component: () => <>{ui}</> })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  // RouterProvider paints nothing on first render - it resolves the
  // matched route first - so every read here is awaited. A synchronous
  // textContent read returns '' no matter how correct the component is.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = render(<RouterProvider router={router as any} />)
  return r
}

async function textOf(ui: ReactNode): Promise<string> {
  const { container } = mount(ui)
  await waitFor(() => {
    if (!container.textContent) throw new Error('never painted')
  })
  return container.textContent ?? ''
}

describe('the balance block hosts the provenance', () => {
  it('renders the balance while the anchor is still pending', async () => {
    const text = await textOf(
      <BalanceBand
        balance={BALANCE}
        asOf={AS_OF}
        entryCount={847}
        anchorPending
      />,
    )

    expect(text).toContain(BALANCE_LABEL)
    expect(text).toContain('Checking against the published record')
  })

  it('renders the balance when the anchor fetch failed outright', async () => {
    const text = await textOf(
      <BalanceBand
        balance={BALANCE}
        asOf={AS_OF}
        entryCount={847}
        anchorFailed
        onAnchorRetry={() => {}}
      />,
    )

    // The balance is unaffected by the anchor's failure...
    expect(text).toContain(BALANCE_LABEL)
    // ...and the failure renders as `unreachable`, which is a real
    // state. A blank here would read as a pass, which is the one thing
    // this surface may never do.
    expect(text).toContain('could not be reached')
    expect(text).toContain('does not mean it is fine either')
  })

  it('renders the provenance when the anchor matches', async () => {
    const status: AnchorStatus = {
      state: 'match',
      publishedAt: PUBLISHED,
      publishedSource: SOURCE,
    }
    const text = await textOf(
      <BalanceBand
        balance={BALANCE}
        asOf={AS_OF}
        entryCount={847}
        anchor={status}
      />,
    )

    expect(text).toContain(BALANCE_LABEL)
    expect(text).toContain(SOURCE)
    // The claim must stay a comparison, never a verification.
    expect(text).not.toMatch(/verified|certified|guaranteed/i)
  })

  it('puts a mismatch warning BEFORE the figure, exactly once', async () => {
    const status: AnchorStatus = {
      state: 'mismatch',
      publishedAt: PUBLISHED,
      publishedSource: SOURCE,
    }
    const { container } = mount(
      <BalanceBand
        balance={BALANCE}
        asOf={AS_OF}
        entryCount={847}
        anchor={status}
      />,
    )
    await waitFor(() => {
      if (!container.textContent?.includes(WARNING)) {
        throw new Error('warning never rendered')
      }
    })
    const text = container.textContent ?? ''

    // Order is the point: the warning tells the resident not to rely on
    // "the figures above", so it has to come first.
    const warnAt = text.indexOf(WARNING)
    const figureAt = text.indexOf(BALANCE_LABEL)
    expect(warnAt).toBeGreaterThanOrEqual(0)
    expect(figureAt).toBeGreaterThanOrEqual(0)
    expect(
      warnAt,
      'the mismatch warning must precede the balance figure, or "do not rely on the figures above" is false',
    ).toBeLessThan(figureAt)

    // Hoisting it must not also duplicate it: AnchorBody is told to
    // suppress its own copy. Two identical warnings read as two faults.
    const occurrences = text.split(WARNING).length - 1
    expect(occurrences, 'the warning is rendered twice').toBe(1)

    // The detail line survives the suppression - the dates and the
    // instruction to show an auditor are not lost with it.
    expect(text).toContain('auditor')
  })

  it('still shows the balance failure state on its own', async () => {
    const text = await textOf(
      <BalanceBand
        balance={BALANCE}
        asOf={AS_OF}
        entryCount={847}
        failed
        onRetry={() => {}}
      />,
    )

    expect(text).toContain("Couldn't load the balance")
    // A failed balance must not claim anything about the record.
    expect(text).not.toContain(WARNING)
  })
})
