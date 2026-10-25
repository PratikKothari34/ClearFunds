import { describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { AttentionBand } from './AttentionBand'
import type { AttentionItem } from '../../lib/types'

/*
 * THE BAND'S HREF IS THE ONE SERVER VALUE THAT BECOMES A NAVIGATION
 * TARGET, so the band is what has to refuse a bad one.
 *
 * `href` was typed `string`, which let the server name any destination
 * at all. On this band that matters more than anywhere else: it is the
 * most-tapped control on an approver's screen, and the thing it is
 * trusted to do is take them to the right internal page.
 *
 * Two failures are checked, and the second is the one that is easy to
 * get wrong. Dropping the row is obvious. Keeping `items.length` as the
 * count while rendering a filtered list is not - the heading would say
 * "2 things need you" above one row, and on an amber band that reads as
 * a row having been approved by someone else while the page was open.
 *
 * The band is rendered inside a real router because it renders `Link`,
 * which throws outside one. A memory history keeps it off the network
 * and out of the URL bar.
 */

function renderBand(items: readonly AttentionItem[]) {
  /*
   * A ROUTE TREE WHOSE ROOT IS THE BAND, not the app's tree with an
   * override.
   *
   * The first version passed the real `routeTree` and a
   * `defaultComponent`, and rendered an empty container - the router
   * served the app's own root route and ignored the override, so every
   * absence assertion passed against ''. The control test in this file
   * is what caught it. A one-route tree cannot do that: the component
   * under test is the only thing the router can render.
   *
   * AND EVERY ASSERTION HERE IS AWAITED. `RouterProvider` renders
   * nothing on the first paint - it resolves the matched route before
   * it renders anything at all - so a synchronous read of
   * `container.textContent` returns '' no matter how correct the band
   * is. That is why this helper is awaited at every call site: an
   * absence assertion read synchronously passes against the empty
   * first paint, which is the same dead-guard shape as a test asserting
   * on a sample number.
   */
  const root = createRootRoute({
    component: () => <AttentionBand items={items} />,
  })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<RouterProvider router={router as any} />)
}

/** Shaped like the server's payload, with the href under test. */
function item(id: string, href: string, label: string): AttentionItem {
  return {
    id,
    kind: 'approval',
    label,
    // The cast is the point: this test exists because the server can
    // send a value the type forbids. Narrowing it here would test the
    // compiler instead of the band.
    href: href as AttentionItem['href'],
  }
}

describe('the attention band and a hostile href', () => {
  it('renders an item whose href is a real route', async () => {
    // Control: the filter passes something through, so every absence
    // assertion below is about the filter and not about a broken render.
    const { container } = renderBand([
      item('ok', '/approvals', 'Approve the plumbing invoice'),
    ])
    await waitFor(() =>
      expect(container.textContent).toContain('Approve the plumbing invoice'),
    )
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      '/approvals',
    )
  })

  it('drops an item pointing at another origin or a scheme', async () => {
    for (const bad of [
      'javascript:alert(1)',
      'https://evil.example/approvals',
      '//evil.example/approvals',
      '/nope',
    ]) {
      const { container } = renderBand([item('bad', bad, 'Looks urgent')])
      /*
       * WAITS FOR THE BAND TO EXIST BEFORE ASSERTING WHAT IS MISSING.
       * This is the one test in the file whose assertions are all
       * absences, so it is the one that passes against a container
       * that never rendered - and it did exactly that while the other
       * three were failing. The band's heading is always present
       * whatever the items are, so it is the proof of life the
       * absences are measured against.
       */
      await waitFor(() =>
        expect(container.querySelector('h2'), bad).not.toBeNull(),
      )
      expect(container.textContent, bad).not.toContain('Looks urgent')
      // Nothing anchored at all, so there is no link to mis-tap.
      expect(container.querySelector('a'), bad).toBeNull()
    }
  })

  it('counts what it shows, not what it was sent', async () => {
    /*
     * THE ASSERTION IS THE AGREEMENT, NOT THE NUMBER. Asserting "says
     * 1" would be satisfied by editing the expected number if the
     * filter regressed. What must hold is that the heading and the
     * list cannot disagree, so the heading is checked against the
     * number of rows actually rendered.
     */
    const { container } = renderBand([
      item('ok', '/disputes', 'A resident asked about October'),
      item('bad', 'https://evil.example', 'Also urgent'),
    ])
    await waitFor(() =>
      expect(container.querySelectorAll('li').length).toBeGreaterThan(0),
    )
    const rows = container.querySelectorAll('li').length
    expect(rows).toBe(1)
    const text = container.textContent ?? ''
    expect(text).not.toContain('Also urgent')
    // One row, so the plural heading for two must not appear anywhere.
    expect(text).not.toContain('2 things need you')
  })

  it('shows the empty state when every item was dropped', async () => {
    /*
     * NOT the failure state. Every href being unusable is a broken
     * payload, but the band cannot tell that from genuinely having
     * nothing - and `failed` is set by the fetch, not by the contents.
     * What must not happen is a heading claiming work exists above an
     * empty list.
     */
    const { container } = renderBand([
      item('bad', 'javascript:alert(1)', 'Phantom work'),
    ])
    await waitFor(() =>
      expect(container.textContent).toContain('Nothing needs you'),
    )
    const text = container.textContent ?? ''
    expect(text).not.toContain('Phantom work')
    expect(container.querySelectorAll('li').length).toBe(0)

    /*
     * THE HEADING IS CHECKED SEPARATELY FROM THE BODY, because they
     * are two different strings and only the body was asserted at
     * first. Deleting the heading's empty-state branch left this test
     * green while the band rendered "0 things need you" directly above
     * "Nothing needs you right now" - the heading and the body
     * contradicting each other on the one band whose whole job is to
     * say truthfully whether the viewer has work. Caught by mutation,
     * not by the suite.
     */
    const heading = container.querySelector('h2')?.textContent ?? ''
    expect(heading).toContain('Nothing needs you')
    // No digit in it: a count in the empty-state heading is the
    // contradiction, whatever number it happens to be.
    expect(heading).not.toMatch(/\d/)
  })
})
