import { SAMPLE_APPROVALS, SAMPLE_FLAG_LOG, SAMPLE_SIGNOFF } from './sample'
import type { Role } from './types'

/**
 * The badge figures on navigation, derived from the data rather than
 * written down.
 *
 * These were an empty object for as long as the shell existed, which
 * meant every badge rendered as nothing and the one figure the product
 * is judged on — how many questions are still unanswered — was never
 * once on screen during development. A hardcoded number would have been
 * worse: it agrees with nothing and stops being wrong only by accident.
 *
 * The server will send these per viewer. This module exists so that
 * when it does, there is one function to replace and the call sites do
 * not change.
 */

/**
 * Unresolved flags only.
 *
 * `resolvedAt` absent is the whole test, and it is the settled rule: a
 * resolved question leaves the count and stays in the entry's log. The
 * log is the record, the count is a to-do list. Counting every flag
 * ever raised would make the figure grow forever and mean a committee
 * that answers everything still looks negligent.
 */
export function unresolvedFlagCount(): number {
  return Object.values(SAMPLE_FLAG_LOG)
    .flat()
    .filter((flag) => flag.resolvedAt === undefined).length
}

/**
 * Approvals this viewer can still act on.
 *
 * An entry the viewer has already approved is not pending FOR THEM: it
 * is waiting on other people. Leaving it in the badge would mean the
 * number never falls when they do their part, which teaches them the
 * badge is noise.
 */
export function pendingApprovalCount(): number {
  return SAMPLE_APPROVALS.filter((a) => !a.viewerHasApproved).length
}

/** Periods still waiting on a signature. */
export function openSignoffCount(): number {
  return SAMPLE_SIGNOFF.length
}

/**
 * Keyed by route, because that is how the navigation looks them up. A
 * role that cannot see a surface never asks for its count, so the map
 * is filtered by role rather than the badges being hidden at render
 * time — a count a viewer should not know is not computed for them.
 */
export function countsFor(role: Role): Record<string, number> {
  const counts: Record<string, number> = {
    '/disputes': unresolvedFlagCount(),
  }

  // A resident raises questions; they do not clear other people's.
  if (role !== 'resident' && role !== 'auditor') {
    counts['/approvals'] = pendingApprovalCount()
  }

  if (role === 'president') {
    counts['/sign-off'] = openSignoffCount()
  }

  return counts
}
