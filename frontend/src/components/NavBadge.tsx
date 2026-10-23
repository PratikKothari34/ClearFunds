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

export const BADGE_CAP = 40

export function NavBadge({
  count,
  label,
}: {
  readonly count: number
  readonly label: string
}) {
  /*
   * `count <= 0` alone is not enough, because EVERY comparison against
   * NaN is false. A NaN count — a figure arriving as a string the server
   * did not mean to send, a subtraction against a missing field, a
   * JSON null coerced with +— sailed straight past that guard and
   * rendered "NaN" in the badge and "NaNNaN items need you in
   * Approvals" to a screen reader.
   *
   * It must also be an integer: 2.5 items need nobody, and a
   * fractional badge means the figure was computed from something it
   * should not have been. Refusing to render is right either way — a
   * missing badge says "nothing is known to be waiting", which is
   * honest, where a wrong one is not.
   */
  if (!Number.isInteger(count) || count <= 0) return null

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
