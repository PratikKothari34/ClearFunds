/*
 * `closable` DECIDES WHETHER THE PRODUCT'S ONE IRREVERSIBLE ACTION IS OFFERED.
 *
 * Closing a year appends a `year_close` to the chain with the auditor's
 * signature over the statement. It cannot be undone, and after it a year's
 * entries can no longer be reversed in that year. So the two failure
 * directions are not symmetric and both are tested here:
 *
 *   - OFFERING the control to someone who may not use it sends them into a
 *     sheet that the server will refuse, after they have written a statement.
 *   - WITHHOLDING it from the appointed auditor leaves the year permanently
 *     unaudited with no visible reason, which is the defect this function was
 *     extracted to fix: `/reports` printed "Only the appointed auditor closes
 *     the year" with no route to doing so.
 *
 * The cases below assert the RULE - which input decides which outcome - and
 * never a sample FY string's meaning. `'2025-26'` here is an opaque token
 * that matches or does not match; nothing reads a year out of it, because
 * nothing in the function does either.
 */
import { describe, expect, it } from 'vitest'
import { closable, type Closable } from './closable'

/** Only the three fields the function reads, so a Year/Me change cannot
 *  silently widen what this suite claims to cover. */
const me = (...fys: string[]) => ({ auditor_for: fys })
const year = (fy: string, ended: boolean, closed: boolean) => ({ fy, ended, closed })

describe('closable', () => {
  it('offers the close only to the appointed auditor of an ended, open year', () => {
    expect(closable(me('2025-26'), year('2025-26', true, false))).toBe('closable')
  })

  it('withholds it from an auditor whose appointment names a different year', () => {
    /*
     * The case the seeded demo actually hits, and the one that makes the nav
     * item misleading on its own: a person IS an auditor, the year HAS ended
     * and is open - and it is still not theirs. `auditor_for` is matched by
     * exact FY, never by "is an auditor at all".
     */
    expect(closable(me('2025-26'), year('2026-27', true, false))).toBe('not_mine')
    expect(closable(me('2024-25', '2025-26'), year('2026-27', true, false))).toBe('not_mine')
    // ...and holding several appointments does not dilute the ones held.
    expect(closable(me('2024-25', '2026-27'), year('2026-27', true, false))).toBe('closable')
  })

  it('withholds it from anyone who is not an auditor, whatever the year looks like', () => {
    /*
     * A resident, and the committee - which is the rule with teeth, because
     * the committee cannot close its own books. A president with every other
     * power in the product lands here with an empty `auditor_for`.
     */
    for (const y of [year('2025-26', true, false), year('2025-26', false, false), year('2025-26', true, true)]) {
      expect(closable(me(), y), JSON.stringify(y)).toBe('not_mine')
    }
  })

  it('distinguishes a year still running from one that was never theirs', () => {
    // Same viewer, same answer-is-no, two different sentences. A boolean
    // cannot carry this and the dead-end sentence is what a boolean produced.
    expect(closable(me('2026-27'), year('2026-27', false, false))).toBe('not_ended')
    expect(closable(me('2025-26'), year('2026-27', false, false))).toBe('not_mine')
  })

  it('reports a closed year as closed, never as pending or as forbidden', () => {
    /*
     * An auditor re-reading the year he signed must not be told it is not
     * his. `closed` outranks `not_ended` too: a server reporting
     * `closed && !ended` is incoherent, and of the two the signature in the
     * chain is the fact - a year with a `year_close` in it IS closed
     * whatever a date comparison says.
     */
    expect(closable(me('2025-26'), year('2025-26', true, true))).toBe('closed')
    expect(closable(me('2025-26'), year('2025-26', false, true))).toBe('closed')
  })

  it('tests the appointment BEFORE the closure, so the reason a resident reads is the true one', () => {
    /*
     * THE ORDERING IS THE DECISION, and this is the case that kills a
     * swapped `if`. Swapping the first two lines of the function keeps every
     * other case in this file green: it only changes the answer for a viewer
     * who is BOTH not the auditor AND looking at a closed year - which on a
     * society with one audited year is every resident on the Reports tab.
     *
     * They must read "this was never yours to close", not "it is already
     * closed", because the second implies it would otherwise have been
     * theirs.
     */
    expect(closable(me(), year('2025-26', true, true))).toBe('not_mine')
    expect(closable(me('2024-25'), year('2025-26', true, true))).toBe('not_mine')
  })

  it('never returns closable for any input a server could report about a non-auditor', () => {
    /*
     * The safety property stated once over the whole input space rather than
     * per case: `closable` requires appointment, full stop. A future edit
     * that adds an outcome or reorders the guards cannot make a non-auditor
     * closable without failing here.
     */
    const outcomes: Closable[] = []
    for (const ended of [true, false]) {
      for (const cl of [true, false]) {
        outcomes.push(closable(me(), year('2025-26', ended, cl)))
        outcomes.push(closable(me('2024-25'), year('2025-26', ended, cl)))
      }
    }
    expect(outcomes).toHaveLength(8)
    expect(outcomes.every((o) => o === 'not_mine')).toBe(true)
  })

  it('is decided only by the fields it documents, so an unrelated Me change cannot flip it', () => {
    // The helper passes exactly `auditor_for` and exactly fy/ended/closed.
    // If the function starts reading a seat or a tenure, this file stops
    // compiling rather than quietly testing a narrower object than ships.
    expect(closable({ auditor_for: ['2025-26'] }, { fy: '2025-26', ended: true, closed: false })).toBe('closable')
  })
})
