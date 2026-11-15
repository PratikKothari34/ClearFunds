/*
 * CAN THIS VIEWER CLOSE THIS YEAR, AND IF NOT, WHY NOT.
 *
 * `/year-end` already decided this inline - `const can = mine && y.ended &&
 * !y.closed` sat in the route - so the answer could not be tested without
 * mounting a router, and `/reports` could not reach it at all. That is how
 * the defect below survived: the one screen an auditor reads before forming
 * an opinion ended with the sentence "No opinion yet. Only the appointed
 * auditor closes the year." and offered him no way to go and do it. A
 * correct statement of the rule, printed as a dead end, to the only person
 * it is addressed to.
 *
 * So the rule lives here, both screens read it, and the reason is part of
 * the answer rather than something each caller re-derives.
 *
 * FOUR OUTCOMES, NOT TWO. "Cannot close" is three different situations and
 * they want three different sentences:
 *
 *   - `closable`   - the appointed auditor, the year has ended, still open.
 *                    This is the only state that may render the control.
 *   - `not_ended`  - his year, but it is still running. A date, not a
 *                    refusal: the control appears by itself on 1 April.
 *   - `closed`     - already signed off. The opinion is on screen above; the
 *                    year cannot be closed twice and must not look pending.
 *   - `not_mine`   - he was not appointed for this year, or is not an
 *                    auditor at all. Residents and the committee land here,
 *                    and the committee cannot close its own books.
 *
 * Collapsing these into a boolean is what produced the dead end. A screen
 * that knows only "no button" cannot tell an auditor his year ends in March
 * from telling a resident this was never his to do.
 *
 * THIS IS NOT ACCESS CONTROL. The server owns the refusal: `api_close_year`
 * checks the appointment, and `/year-end`'s submit re-checks the opinion and
 * the statement because a disabled attribute is a UI guarantee and the write
 * goes into the chain. This function decides what to OFFER. If it and the
 * server ever disagree, the server wins and the screen was merely unhelpful
 * - which is the right direction for a client-side test to fail in.
 */
import type { Me, Year } from './types'

export type Closable = 'closable' | 'not_ended' | 'closed' | 'not_mine'

/**
 * Whether `me` may close `y` now, and the reason when they may not.
 *
 * `auditor_for` is the list of financial years this person was appointed to
 * audit, by FY string. Membership is matched exactly: an auditor appointed
 * for 2025-26 has no claim on 2026-27, which is the ordinary case the moment
 * a new year begins and is why the nav item appearing is never on its own
 * evidence that a year is closable.
 */
export function closable(me: Pick<Me, 'auditor_for'>, y: Pick<Year, 'fy' | 'ended' | 'closed'>): Closable {
  /*
   * `not_mine` is tested FIRST and `closed` second, which is the order the
   * sentences have to be read in.
   *
   * A resident looking at a closed year is not being told "you cannot close
   * this because it is already closed" - that implies it would otherwise
   * have been theirs to close. It was never theirs. Reversing these two
   * reads the rule backwards to everyone who is not the auditor, which on
   * this product is almost everyone.
   */
  if (!me.auditor_for.includes(y.fy)) return 'not_mine'
  if (y.closed) return 'closed'
  if (!y.ended) return 'not_ended'
  return 'closable'
}
