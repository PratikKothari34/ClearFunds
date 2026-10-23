import type { FlagLogItem, PendingApproval, Role, SignoffPeriod } from './types'

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
 * NOTHING IN THIS MODULE IMPORTS SAMPLE DATA, and that is a security
 * boundary, not a style preference.
 *
 * It used to import SAMPLE_FLAG_LOG, SAMPLE_APPROVALS and SAMPLE_SIGNOFF
 * directly. `__root.tsx` imports this module, so that one import chain
 * pulled the entire fixture into the entry chunk — the bundle every
 * role downloads on every page load. Verified in the built output: every
 * flat's questions, every resident handle and every per-flat dues amount
 * were sitting in `dist/assets/index-*.js`, readable by any viewer, while
 * `/my-flat` told residents "only you and the society's treasurer and
 * secretary can see this".
 *
 * The data is invented, so nothing real leaked. The SHAPE is the flaw:
 * at cutover the same chain carries a real payload and no code change
 * marks the moment it stops being fixtures. Counts are now passed in, so
 * a caller cannot pull resident data into first paint by using this
 * module, and the server-fed version is a drop-in — the call sites and
 * the role filtering below do not change.
 */

/**
 * Unresolved flags only.
 *
 * `resolvedAt` absent is the whole test, and it is the settled rule: a
 * resolved question leaves the count and stays in the entry's log. The
 * log is the record, the count is a to-do list. Counting every flag
 * ever raised would make the figure grow forever and mean a committee
 * that answers everything still looks negligent.
 *
 * `== null`, not `=== undefined`: JSON carries no `undefined`, so a
 * backend sending `"resolvedAt": null` for an open question would make
 * it count as ANSWERED and drop it out of the figure residents are
 * shown. The direction of that failure is the problem — it hides
 * unanswered questions rather than over-reporting them.
 */
export function unresolvedFlagCount(
  flags: readonly FlagLogItem[],
): number {
  return flags.filter((flag) => flag.resolvedAt == null).length
}

/**
 * Approvals this viewer can still act on.
 *
 * An entry the viewer has already approved is not pending FOR THEM: it
 * is waiting on other people. Leaving it in the badge would mean the
 * number never falls when they do their part, which teaches them the
 * badge is noise.
 */
export function pendingApprovalCount(
  approvals: readonly PendingApproval[],
): number {
  return approvals.filter((a) => !a.viewerHasApproved).length
}

/** Periods still waiting on a signature. */
export function openSignoffCount(
  periods: readonly SignoffPeriod[],
): number {
  return periods.length
}

/**
 * Everything the badges need, as the caller has it.
 *
 * Optional because the shell renders before any of it has arrived: a
 * missing figure means "not known yet", which `countsFor` turns into no
 * badge rather than a zero. A zero is a claim that nothing is waiting.
 */
export interface CountSources {
  readonly flags?: readonly FlagLogItem[]
  readonly approvals?: readonly PendingApproval[]
  readonly signoff?: readonly SignoffPeriod[]
}

/**
 * Keyed by route, because that is how the navigation looks them up. A
 * role that cannot see a surface never asks for its count, so the map
 * is filtered by role rather than the badges being hidden at render
 * time — a count a viewer should not know is not computed for them.
 *
 * With the sources passed in, that sentence is now true of the bundle
 * as well as of the render: a resident's build has no reason to contain
 * the approval queue at all.
 */
export function countsFor(
  role: Role,
  sources: CountSources = {},
): Record<string, number> {
  const counts: Record<string, number> = {}

  if (sources.flags) {
    counts['/disputes'] = unresolvedFlagCount(sources.flags)
  }

  // A resident raises questions; they do not clear other people's.
  if (role !== 'resident' && role !== 'auditor' && sources.approvals) {
    counts['/approvals'] = pendingApprovalCount(sources.approvals)
  }

  if (role === 'president' && sources.signoff) {
    counts['/sign-off'] = openSignoffCount(sources.signoff)
  }

  return counts
}
