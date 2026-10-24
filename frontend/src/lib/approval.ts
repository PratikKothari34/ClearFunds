import type { PendingApproval } from './types'

/**
 * Whether a pending approval's counts can be shown to an admin.
 *
 * THE INVARIANT THIS EXISTS FOR: no single admin moves the ledger
 * alone. The tier trades N-of-M for treasurer-and-secretary, never for
 * one person — a one-person approval is rejected at any limit.
 *
 * The approvals route used to interpolate `approvalsRequired` straight
 * into "so it needs {n} committee members", with no floor. A payload
 * carrying `approvalsRequired: 1` therefore rendered "so it needs 1
 * committee members" next to a working Approve button: the product
 * telling an admin, in words, that one person can clear an above-limit
 * expense. That is the invariant stated in reverse on the surface whose
 * whole job is to state it.
 *
 * Enforcement is server-side and stays there. This is the display
 * check: the frontend cannot make an approval valid, but it must not
 * narrate an invalid one as though it were the rule.
 */

/** Why a pending approval's counts cannot be trusted, or null if they can. */
export type ApprovalFault =
  | 'approvals-required-below-two'
  | 'both-tier-not-two'
  | 'counts-not-finite'
  | null

/**
 * The fault in an approval's counts, or null when they are sound.
 *
 * `Number.isInteger` rather than a comparison: every comparison against
 * NaN is false in both directions, so a `>= 2` guard alone neither
 * accepts nor rejects a NaN and the answer falls through to whatever
 * the next branch happens to be. This is the same hole already fixed in
 * `NavBadge` and in `newestEntry`.
 */
export function approvalFault(item: PendingApproval): ApprovalFault {
  if (
    !Number.isInteger(item.approvedCount) ||
    !Number.isInteger(item.approvalsRequired) ||
    item.approvedCount < 0
  ) {
    return 'counts-not-finite'
  }

  // The floor, not a settings default. Configurable higher, never lower.
  if (item.approvalsRequired < 2) return 'approvals-required-below-two'

  /*
   * `both` means the treasurer AND the secretary: exactly two. A `both`
   * tier carrying any other number means the tier and the count
   * disagree, and the route's sentence for this tier does not print the
   * number — so it would say "both of them" over a count that says
   * something else, which is the quietest version of the same lie.
   */
  if (item.tier === 'both' && item.approvalsRequired !== 2) {
    return 'both-tier-not-two'
  }

  return null
}

/**
 * How many approvals are still needed.
 *
 * Call only on an item with no `approvalFault`. Returning a clamped
 * number for a faulted item would hide the fault behind a plausible
 * figure, which is how `remaining = required - approved` produced a
 * green "Ready to be recorded." from a NaN: `NaN > 0` is false, so the
 * page took the else branch and told an admin an expense with no
 * approvals was ready to record.
 */
export function approvalsRemaining(item: PendingApproval): number {
  return Math.max(0, item.approvalsRequired - item.approvedCount)
}

/** Whether every required approval is in. */
export function isFullyApproved(item: PendingApproval): boolean {
  return item.approvedCount >= item.approvalsRequired
}
