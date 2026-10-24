import { describe, expect, it } from 'vitest'
import {
  approvalFault,
  approvalsRemaining,
  isFullyApproved,
} from './approval'
import type { ApprovalTier, PendingApproval } from './types'

/*
 * THE INVARIANT: no single admin moves the ledger alone. The tier
 * trades N-of-M for treasurer-and-secretary, never for one person.
 *
 * These assert the rule, not the sample. The floor is two because two
 * is the invariant, so the `2` in these tests is the rule itself and
 * not a fixture number - the one case where a literal belongs in an
 * assertion.
 */

function pending(over: Partial<PendingApproval> = {}): PendingApproval {
  return {
    id: 'p-1',
    narration: 'Terrace waterproofing',
    payee: 'Shree Waterproofing',
    amount: { minor: 4500000, currency: 'INR' },
    direction: 'out',
    raisedAt: '2026-04-02T11:00:00+05:30',
    raisedByHandle: 'Treasurer',
    tier: 'n-of-m',
    approvedCount: 1,
    approvalsRequired: 5,
    viewerHasApproved: false,
    limitInForce: { minor: 2500000, currency: 'INR' },
    ...over,
  }
}

describe('approvalFault', () => {
  it('passes a sound N-of-M approval', () => {
    expect(approvalFault(pending())).toBeNull()
  })

  it('passes a sound both-tier approval', () => {
    expect(
      approvalFault(pending({ tier: 'both', approvalsRequired: 2 })),
    ).toBeNull()
  })

  it('rejects a requirement of one, at any limit', () => {
    /*
     * The bug this exists for: the route interpolated the number
     * straight into "so it needs {n} committee members", so a payload
     * carrying 1 rendered "so it needs 1 committee members" beside a
     * working Approve button - the invariant stated in reverse, on the
     * surface whose whole job is to state it.
     */
    for (const n of [1, 0, -3]) {
      expect(approvalFault(pending({ approvalsRequired: n }))).toBe(
        'approvals-required-below-two',
      )
    }
  })

  it('treats the floor as two for both tiers', () => {
    /*
     * A one-person approval is rejected whichever tier claims it. The
     * tier is the thing that varies; the floor is not.
     */
    const tiers: readonly ApprovalTier[] = ['both', 'n-of-m']
    for (const tier of tiers) {
      expect(
        approvalFault(pending({ tier, approvalsRequired: 1 })),
      ).not.toBeNull()
    }
  })

  it('rejects a both tier that does not mean exactly two', () => {
    /*
     * The route does not print the number for this tier - it says
     * "both of them" - so a mismatch would narrate two over a count
     * that says something else. The quietest version of the same lie.
     */
    for (const n of [3, 5]) {
      expect(
        approvalFault(pending({ tier: 'both', approvalsRequired: n })),
      ).toBe('both-tier-not-two')
    }
  })

  it('rejects a count that is not a whole number', () => {
    /*
     * Number.isInteger, not a comparison. Every comparison against NaN
     * is false in BOTH directions, so a `>= 2` guard alone neither
     * accepts nor rejects NaN and the answer falls through to whatever
     * branch comes next - which is how a NaN produced a green "Ready to
     * be recorded."
     */
    const bad = [NaN, Infinity, -Infinity, 2.5]
    for (const n of bad) {
      expect(approvalFault(pending({ approvalsRequired: n }))).toBe(
        'counts-not-finite',
      )
      expect(approvalFault(pending({ approvedCount: n }))).toBe(
        'counts-not-finite',
      )
    }
  })

  it('rejects a negative approved count', () => {
    expect(approvalFault(pending({ approvedCount: -1 }))).toBe(
      'counts-not-finite',
    )
  })

  it('reports an unusable count before judging the requirement', () => {
    /*
     * Order matters for the message the route shows. A NaN requirement
     * is not a "needs fewer than two" fault - saying so would send an
     * admin looking for a threshold setting over a malformed payload.
     */
    expect(approvalFault(pending({ approvalsRequired: NaN }))).toBe(
      'counts-not-finite',
    )
  })

  it('accepts zero approvals so far', () => {
    // Nothing approved yet is the normal state of a new entry.
    expect(approvalFault(pending({ approvedCount: 0 }))).toBeNull()
  })
})

describe('approvalsRemaining', () => {
  it('is the shortfall between what is in and what is needed', () => {
    const item = pending({ approvedCount: 2, approvalsRequired: 5 })
    expect(approvalsRemaining(item)).toBe(
      item.approvalsRequired - item.approvedCount,
    )
  })

  it('never goes below zero when more approvals arrived than needed', () => {
    /*
     * A negative remaining would render as "needs -1 more", and the
     * route branches on `> 0`, so the sign is load-bearing.
     */
    expect(
      approvalsRemaining(pending({ approvedCount: 7, approvalsRequired: 5 })),
    ).toBe(0)
  })

  it('is zero exactly when the requirement is met', () => {
    const item = pending({ approvedCount: 5, approvalsRequired: 5 })
    expect(approvalsRemaining(item)).toBe(0)
  })
})

describe('isFullyApproved', () => {
  it('is false while any approval is outstanding', () => {
    expect(
      isFullyApproved(pending({ approvedCount: 4, approvalsRequired: 5 })),
    ).toBe(false)
  })

  it('is true once the requirement is met', () => {
    expect(
      isFullyApproved(pending({ approvedCount: 5, approvalsRequired: 5 })),
    ).toBe(true)
  })

  it('agrees with approvalsRemaining on every sound item', () => {
    /*
     * Two functions, one fact. The route shows a "ready" state from one
     * and a "needs n more" line from the other, so a disagreement puts
     * both sentences on screen at once.
     */
    for (let approved = 0; approved <= 7; approved++) {
      const item = pending({ approvedCount: approved, approvalsRequired: 5 })
      expect(isFullyApproved(item)).toBe(approvalsRemaining(item) === 0)
    }
  })
})
