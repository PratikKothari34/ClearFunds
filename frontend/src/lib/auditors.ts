/*
 * WHETHER THIS SOCIETY HAS APPOINTED AN AUDITOR, OR WE SIMPLY COULD NOT ASK.
 *
 * `/committee` rendered the Auditors card from `(years.data ?? [])` and, when
 * nothing in that list carried an auditor, printed:
 *
 *     No auditor appointed yet.
 *
 * `useYears()` is a plain `useQuery`, so `years.data` is `undefined` while the
 * read is in flight AND when it has failed. Either way the coalesce produced
 * `[]`, `.some(...)` was false, and the screen made a statement about the
 * society's statutory position from no data at all.
 *
 * The route's only error arm covers `c` - the committee read - and the
 * Auditors card sits outside it, so nothing above this decided anything about
 * `years`. A committee that has appointed its auditor read as one that had
 * not, on the screen whose job is to say who holds which office.
 *
 * Same family as the dispute list and the nav badge, and the reason the rule
 * is three outcomes and never two: an empty state is a positive CLAIM, so it
 * may only be reached once the read has actually succeeded. "No auditor" and
 * "we could not check" are different sentences, and only one of them is
 * defensible when the read failed.
 *
 * The data carries its own third value besides: `Year.auditor` is
 * `{...}[] | null`, where `null` is the server declining to say rather than an
 * empty appointment list. A year whose auditor field is null is NOT evidence
 * that nobody was appointed, so it cannot be counted towards "none" either.
 */
import type { Year } from './types'

export type AuditorPresence =
  /** The read succeeded and at least one year names an auditor. */
  | { kind: 'some'; years: readonly Year[] }
  /** The read succeeded, every year reported its auditors, and there are none. */
  | { kind: 'none' }
  /** Still in flight. Nothing may be claimed yet. */
  | { kind: 'pending' }
  /** The read failed, or the server declined to report appointments. */
  | { kind: 'unknown' }

type YearsQuery = {
  data: readonly Year[] | undefined
  isPending: boolean
  isError: boolean
}

/** A year that actually names at least one auditor. */
export function named(y: Year): boolean {
  return !!y.auditor && y.auditor.length > 0
}

export function auditorPresence(q: YearsQuery): AuditorPresence {
  /*
   * Error FIRST, before the data is looked at. TanStack keeps the last
   * successful rows across a failed background refetch, so `isError` can
   * arrive with a populated `data` - and reporting those as current presents
   * a stale answer as a fresh one. The same ordering as `disputeState`.
   */
  if (q.isError) return { kind: 'unknown' }
  if (q.isPending || q.data === undefined) return { kind: 'pending' }

  const years = q.data.filter(named)
  if (years.length > 0) return { kind: 'some', years }

  /*
   * Nothing named an auditor. Before saying "none", every year must actually
   * have REPORTED its appointments: a null `auditor` is the server declining
   * to answer, and counting that as an absence is the `?? []` bug one layer
   * in. An empty list is a real answer; a null is not.
   */
  if (q.data.some((y) => y.auditor === null)) return { kind: 'unknown' }

  return { kind: 'none' }
}
