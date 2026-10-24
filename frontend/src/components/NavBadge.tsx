/**
 * The count badge, one implementation for the rail and the tab bar.
 *
 * Two rules the design fixes:
 *
 *   - A count is never shown raw past 40. "47 approvals" and "40+"
 *     prompt the same action, and an exact large number invites a
 *     volunteer to read it as a backlog they have failed at.
 *   - Zero renders nothing. A badge showing 0 is a notification that
 *     there is no notification.
 *
 * The number is also announced, because a bare numeral next to a label
 * is read by a screen reader as "Approvals 3", which does not say what
 * the 3 counts.
 */

import { isShowableCount } from '../lib/countable'

export const BADGE_CAP = 40

export function NavBadge({
  count,
  label,
}: {
  /*
   * `unknown`, not `number`, and not `number | undefined`.
   *
   * Every call site looked up a count in a per-route map and wrote
   * `?? 0` to satisfy a `number` prop. That default is a claim this
   * component exists to refuse: zero means "nothing is waiting", and an
   * absent key means "not known yet". The two render identically here,
   * so the harm was not on screen - it was that the type pushed three
   * call sites into asserting a figure none of them had, and the one
   * place NaN would then be caught was downstream of where it entered.
   *
   * The guard below is total, so a wider type costs nothing and the
   * `?? 0` disappears from every caller.
   */
  readonly count: unknown
  readonly label: string
}) {
  /*
   * The rule lives in `lib/countable.ts`, because four other surfaces
   * asked this question in four weaker ways and this was the only one
   * that got it right.
   */
  // The predicate is a type guard, so `count` is a positive integer
  // from here down and the arithmetic below needs no further checks.
  if (!isShowableCount(count)) return null

  const shown = count > BADGE_CAP ? `${BADGE_CAP}+` : String(count)

  return (
    <>
      <span
        aria-hidden="true"
        className="cf-tabular inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-meta leading-none bg-attention text-surface"
      >
        {shown}
      </span>
      <span className="cf-sr-only">
        {count > BADGE_CAP
          ? `more than ${BADGE_CAP} items need you in ${label}`
          : `${count} ${count === 1 ? 'item needs' : 'items need'} you in ${label}`}
      </span>
    </>
  )
}
