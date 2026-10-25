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
        /*
         * `bg-error text-on-error` is the EXPORT'S OWN badge pairing,
         * and it is used here in place of the attention colour this
         * badge carried before.
         *
         * The mechanical token sweep mapped the old `bg-attention` to
         * `bg-tertiary-fixed`, which in Stitch is a PALE peach
         * (#ffdcc3). With a near-white label on it that measured
         * 1.23:1 - a count a resident simply cannot read, on the one
         * element whose entire job is to be noticed. Stitch's
         * saturated `tertiary` is no use either: the config leaves it
         * at #000000.
         *
         * `error` is #ba1a1a with a white `on-error`, 6.15:1, and it
         * is what the export's own sidebar badge uses.
         *
         * THIS IS NOT A SEVERITY CLAIM. The badge counts things
         * waiting - approvals, unanswered questions - and none of them
         * is an error. The token is named for its place in the palette,
         * not for a meaning, and the accessible text beside it says
         * what the number is. Colour never carries the meaning alone.
         */
        className="cf-tabular inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full font-label-code-sm text-label-code-sm leading-none bg-error text-on-error"
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
