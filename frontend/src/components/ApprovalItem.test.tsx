import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ApprovalItem } from './ApprovalItem'
import type { PendingApproval } from '../lib/types'

/*
 * The approvals surface must never NARRATE an approval reduced to one
 * person.
 *
 * `approvalFault` existed and the Approve button was already
 * suppressed, yet the item went on printing the two sentences built by
 * interpolating the condemned counts: "so it needs 1 committee member"
 * and, because `approvedCount >= approvalsRequired` holds at 1 of 1, a
 * green "Ready to be recorded." - directly above a banner saying the
 * item could not be approved. Hiding the button was half the fix.
 *
 * These tests render the component with the payload, so they cover the
 * RENDERED SENTENCE rather than the predicate. approval.test.ts already
 * covers `approvalFault` itself, and it passed throughout the bug.
 *
 * This renders the COMPONENT, never the route. A first version of this
 * file sat in `routes/` and drove `Route.component`, which cannot work:
 * `autoCodeSplitting` rewrites every file under `routes/` and replaces
 * the component with a lazy reference, so the render produced an empty
 * container - and every `not.toMatch` assertion passed against ''. An
 * absence assertion that never saw the page is the failure mode this
 * whole file exists to prevent, so the positive assertions below are
 * load-bearing: they are what proves the page rendered at all.
 */

afterEach(cleanup)

const sound: PendingApproval = {
  id: 'p-1',
  narration: 'Lift annual maintenance contract',
  payee: 'Omega Elevators',
  amount: { minor: 12500000, currency: 'INR' },
  direction: 'out',
  raisedAt: '2026-10-21T09:12:00+05:30',
  raisedByHandle: 'Treasurer',
  tier: 'n-of-m',
  approvedCount: 2,
  approvalsRequired: 5,
  viewerHasApproved: false,
  limitInForce: { minor: 5000000, currency: 'INR' },
}

describe('an approval the record says needs one person', () => {
  /*
   * Every shape `approvalFault` rejects, not a single sample: the point
   * is that NO faulted payload reaches a sentence built from its counts.
   */
  const faulted: readonly (readonly [string, PendingApproval])[] = [
    ['one approval required', { ...sound, approvalsRequired: 1, approvedCount: 1 }],
    ['zero approvals required', { ...sound, approvalsRequired: 0, approvedCount: 0 }],
    [
      'a both tier claiming a number other than two',
      { ...sound, tier: 'both', approvalsRequired: 3, approvedCount: 3 },
    ],
    [
      'counts that are not integers',
      { ...sound, approvalsRequired: NaN, approvedCount: NaN },
    ],
  ]

  it('still identifies which expense is wrong', () => {
    /*
     * FIRST, because it is the control for every absence assertion
     * below: withholding the counts must not withhold the expense, and
     * if this fails the others are passing against an empty render.
     */
    for (const [label, item] of faulted) {
      const { container, unmount } = render(<ApprovalItem item={item} />)
      const text = container.textContent ?? ''
      expect(text, label).toContain('Omega Elevators')
      expect(text, label).toContain('Lift annual maintenance contract')
      expect(text, label).toMatch(/cannot be approved/i)
      expect(text, label).toMatch(/nothing has been recorded/i)
      unmount()
    }
  })

  it('never says an expense needs one committee member', () => {
    for (const [label, item] of faulted) {
      const { container, unmount } = render(<ApprovalItem item={item} />)
      const text = container.textContent ?? ''
      // The page rendered - so the absence below means something.
      expect(text.length, label).toBeGreaterThan(0)
      // The claim, in any phrasing a count of 1 could produce.
      expect(text, label).not.toMatch(/needs\s*1\s*committee/i)
      expect(text, label).not.toMatch(/\b1\s*committee\s*member\b/i)
      unmount()
    }
  })

  it('never calls a faulted expense ready to be recorded', () => {
    /*
     * This was the dangerous half. `isFullyApproved` is a bare `>=`, so
     * 1 of 1 and 0 of 0 both satisfy it, and the page printed the green
     * sentence an admin reads as "this one is done".
     */
    for (const [label, item] of faulted) {
      const { container, unmount } = render(<ApprovalItem item={item} />)
      expect(container.textContent?.length, label).toBeGreaterThan(0)
      expect(container.textContent, label).not.toMatch(/ready to be recorded/i)
      unmount()
    }
  })

  it('prints no approval tally at all', () => {
    // "0 of 0 approvals so far" is as misleading as the green sentence.
    for (const [label, item] of faulted) {
      const { container, unmount } = render(<ApprovalItem item={item} />)
      expect(container.textContent?.length, label).toBeGreaterThan(0)
      expect(container.textContent, label).not.toMatch(/approvals so far/i)
      unmount()
    }
  })

  it('offers no way to approve it', () => {
    for (const [label, item] of faulted) {
      const { container, unmount } = render(<ApprovalItem item={item} />)
      expect(container.textContent?.length, label).toBeGreaterThan(0)
      expect(container.querySelectorAll('button'), label).toHaveLength(0)
      unmount()
    }
  })
})

describe('a sound approval', () => {
  it('states the count and the limit in force', () => {
    const { container } = render(<ApprovalItem item={sound} />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/5\s*committee\s*members/i)
    expect(text).toMatch(/approvals so far/i)
    // The limit that applied when it was raised, not today's.
    expect(text).toMatch(/above the society/i)
  })

  it('offers the approve button', () => {
    const { container } = render(<ApprovalItem item={sound} />)
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })

  it('names both offices on the lower tier, and no number', () => {
    const { container } = render(
      <ApprovalItem
        item={{ ...sound, tier: 'both', approvalsRequired: 2, approvedCount: 1 }}
      />,
    )
    const text = container.textContent ?? ''
    expect(text).toMatch(/treasurer and the secretary/i)
    expect(text).toMatch(/both of them/i)
  })

  it('says so rather than hiding the button once this viewer approved', () => {
    const { container } = render(
      <ApprovalItem item={{ ...sound, viewerHasApproved: true }} />,
    )
    expect(container.textContent).toMatch(/you have approved this/i)
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})
