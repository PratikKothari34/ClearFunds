/*
 * WHO A PROPOSAL IS WAITING ON, AND WHICH MONTHS ARE STILL UNSIGNED.
 *
 * Both of these decided something and lived in components/Shell.tsx, where
 * nothing could test them without mounting a router. waitsOn gates the
 * Approve and Decline buttons on the approvals card, the approvals badge in
 * the nav, and the dashboard's "waiting for your approval" list - three
 * surfaces, one rule, and a wrong answer either hides a signature someone
 * owes or offers a vote on a proposal that is already closed.
 *
 * recentMonths feeds the president's sign-off badge on EVERY page load and
 * the twelve rows of the sign-off screen.
 */
import type { Me, ProposalRow } from './types'

/**
 * Is this proposal waiting on this person's vote?
 *
 * The state check comes first and is not optional. Only an `open` proposal
 * can be voted on; `posted`, `declined`, `withdrawn`, `superseded` and
 * `year_closed` are all closed, and a seventh state added to the contract
 * is closed here too - the test asserts that, so widening cf.proposal_status
 * cannot quietly re-open the buttons.
 */
export function waitsOn(p: ProposalRow, me: Me): boolean {
  if (p.state !== 'open' || !me.seat) return false
  if (p.approvals.some((a) => a.person === me.person)) return false
  // Above the limit everyone votes; at or below it, only the two named
  // officers - 0004's tier, which never reduces to one person.
  return p.tier === 'committee' || me.seat.role === 'treasurer' || me.seat.role === 'secretary'
}

/**
 * `cur` and the n-1 months before it, newest first, as `YYYY-MM`.
 *
 * Date.UTC normalises a negative month index, so a January `cur` rolls back
 * into the previous year without a special case. `cur` comes from
 * todayIST(), which is Intl.DateTimeFormat('en-CA') and therefore always
 * well-formed - but a malformed one would make Number() NaN and
 * toISOString() throw RangeError during render, with no error boundary in
 * the tree, so this refuses rather than throws.
 */
export function recentMonths(cur: string, n: number): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(cur.slice(0, 7))
  if (!m || !Number.isInteger(n) || n <= 0) return []
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return []
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(year, month - 1 - i, 1)).toISOString().slice(0, 7))
}
