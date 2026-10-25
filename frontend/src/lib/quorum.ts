import type { ApprovalPolicy, CommitteeSeat } from './types'

/**
 * Reading the committee roster and the quorum rule.
 *
 * DISPLAY ONLY. Enforcement is server-side and stays there. What this
 * module exists to prevent is the frontend NARRATING a rule that is
 * not the rule — the same class of bug as `approval.ts`, which caught
 * a page willing to print "so it needs 1 committee member".
 *
 * The one piece of arithmetic here is `ceil(2M/3)`, and it is
 * deliberately NOT used to compute what an entry needs. The server
 * snapshots that number into the chain when the entry is raised. This
 * recomputation exists only to CHECK the snapshot: if the two
 * disagree, the surface says so instead of showing either figure as
 * though it were authoritative.
 */

/**
 * The statutory floor: at least two-thirds of seats, rounded up.
 *
 * A hard floor in code, not a settings default. Configurable higher,
 * never lower. 4 of 5 and 5 of 7 — never 3 of 5, which is what plain
 * rounding gives.
 */
export function quorumFloor(seats: number): number | null {
  if (!Number.isInteger(seats) || seats < 2) return null
  return Math.ceil((2 * seats) / 3)
}

/** Why a policy's figures cannot be shown, or null when they are sound. */
export type PolicyFault =
  | 'seats-not-a-committee'
  | 'quorum-below-floor'
  | 'quorum-above-seats'
  | null

/**
 * The fault in a snapshotted policy, or null when it holds.
 *
 * `quorum-below-floor` is the one that matters: a snapshot claiming a
 * lower threshold than two-thirds is either a server bug or a tampered
 * record, and either way the figure must not be displayed as the rule.
 *
 * A quorum ABOVE the floor is legitimate — the committee may configure
 * higher — so only the floor and the seat count bound it.
 */
export function policyFault(policy: ApprovalPolicy): PolicyFault {
  const floor = quorumFloor(policy.seats)
  if (floor === null) return 'seats-not-a-committee'
  if (!Number.isInteger(policy.quorumRequired)) return 'quorum-below-floor'
  if (policy.quorumRequired < floor) return 'quorum-below-floor'
  if (policy.quorumRequired > policy.seats) return 'quorum-above-seats'
  return null
}

/**
 * Seats that can actually sign right now.
 *
 * Counted for DISCLOSURE, never as a denominator. The denominator is
 * `policy.seats`, which a resignation does not move — see the note on
 * `CommitteeSeat`. This figure answers a different question: whether
 * enough keys exist today to reach the threshold at all.
 */
export function signableSeats(roster: readonly CommitteeSeat[]): number {
  return roster.filter((s) => s.status === 'active').length
}

/**
 * Whether the roster can still reach its own threshold.
 *
 * False means the committee is BLOCKED: restrictions and vacancies
 * have taken enough keys out that no expense above the limit can be
 * approved by anyone. That is a governance emergency and the surface
 * says so plainly — it is not a loading state and not a quiet empty
 * queue.
 */
export function canReachQuorum(
  roster: readonly CommitteeSeat[],
  policy: ApprovalPolicy,
): boolean {
  return signableSeats(roster) >= policy.quorumRequired
}
