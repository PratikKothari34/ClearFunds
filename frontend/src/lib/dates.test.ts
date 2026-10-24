import { describe, expect, it } from 'vitest'
import { byTimestampAsc, formatDate, formatDateTime } from './dates'

/*
 * The time zone is an accounting rule, not a display preference, so
 * these tests are about which FINANCIAL YEAR an entry falls in rather
 * than about formatting.
 *
 * None of them depends on the machine's own zone, and that is the
 * point: the bug being guarded is a date that changes with the reader's
 * location.
 */

describe('formatDate', () => {
  it('shows the society calendar day, not the viewer device day', () => {
    /*
     * 00:30 IST on 1 April 2026. In Los Angeles that instant is
     * 12:00 on 31 March 2026, and 31 March and 1 April sit in
     * DIFFERENT financial years under the Indian financial year.
     *
     * Without a pinned zone, the same entry appeared in the closed year
     * for an overseas resident and the open year for the treasurer, and
     * an AGM figure checked against the ledger did not add up. Nothing
     * errored; the two readers just disagreed.
     */
    expect(formatDate('2026-04-01T00:30:00+05:30')).toBe('1 Apr 2026')
  })

  it('shows the same day for an instant written in any zone', () => {
    // Three spellings of one instant. All must land on the same
    // society day, or the display depends on how the server chose to
    // serialise the timestamp.
    const sameInstant = [
      '2026-04-01T00:30:00+05:30',
      '2026-03-31T19:00:00Z',
      '2026-03-31T12:00:00-07:00',
    ]
    const rendered = new Set(sameInstant.map(formatDate))
    expect(rendered.size, [...rendered].join(' | ')).toBe(1)
  })

  it('does not roll a late-evening IST entry into the next day', () => {
    // 23:45 IST is 18:15 UTC. Formatting in UTC would still say the
    // same day here, so this case alone would not catch the bug - it
    // is here because the opposite boundary is the one that moves.
    expect(formatDate('2026-10-21T23:45:00+05:30')).toBe('21 Oct 2026')
  })

  it('renders a dash, never the string "Invalid Date"', () => {
    /*
     * `new Date('not a date')` is an Invalid Date and formatting one
     * returns the literal text "Invalid Date", which went on screen
     * beside a real amount in the product whose claim is that the
     * record can be trusted. A dash reads as a field that did not
     * arrive.
     */
    for (const bad of ['', 'not a date', '2026-13-45', 'null', 'undefined']) {
      const out = formatDate(bad)
      expect(out, bad).not.toContain('Invalid')
      expect(out, bad).not.toContain('NaN')
      expect(out, bad).toBe('—')
    }
  })
})

describe('formatDateTime', () => {
  it('shows the society clock time, not the viewer device clock', () => {
    const out = formatDateTime('2026-04-01T00:30:00+05:30')
    expect(out).toContain('1 Apr 2026')
    // 12:30 am in IST. The hour is what distinguishes two approvals on
    // one day, so a shifted hour reorders them on screen.
    expect(out.toLowerCase()).toContain('12:30')
  })

  it('agrees with formatDate about which day it is', () => {
    // Two functions, one zone. If they ever drift, an entry's date and
    // its approval trail would name different days for one instant.
    const iso = '2026-04-01T00:30:00+05:30'
    expect(formatDateTime(iso)).toContain(formatDate(iso))
  })

  it('renders a dash for an unreadable timestamp', () => {
    expect(formatDateTime('not a date')).toBe('—')
  })
})

describe('byTimestampAsc', () => {
  /*
   * The disputes list is ordered oldest-first with this, because the
   * question waiting longest is the one the committee has failed for
   * longest. The ordering is the claim the page makes.
   */
  const sorted = (list: readonly (string | undefined)[]) =>
    [...list].sort(byTimestampAsc)

  it('puts the earlier instant first', () => {
    expect(
      byTimestampAsc('2026-04-01T10:00:00+05:30', '2026-04-02T10:00:00+05:30'),
    ).toBeLessThan(0)
  })

  it('puts the later instant second', () => {
    expect(
      byTimestampAsc('2026-04-02T10:00:00+05:30', '2026-04-01T10:00:00+05:30'),
    ).toBeGreaterThan(0)
  })

  it('compares the instant, not the written text', () => {
    /*
     * Two ways of writing the same moment must compare equal, and a
     * later moment written in an earlier-looking zone must still sort
     * later. A string comparison gets both of these wrong.
     */
    expect(
      byTimestampAsc('2026-04-01T10:00:00+05:30', '2026-04-01T04:30:00Z'),
    ).toBe(0)
    expect(
      byTimestampAsc('2026-04-01T23:00:00+05:30', '2026-04-01T19:00:00Z'),
    ).toBeLessThan(0)
  })

  it('sends an unreadable timestamp to the end from either position', () => {
    /*
     * Every comparison against NaN is false in BOTH directions, so a
     * subtraction-only comparator leaves the answer dependent on where
     * the bad value happened to sit in the input.
     */
    const good = '2026-04-01T10:00:00+05:30'
    expect(byTimestampAsc(undefined, good)).toBeGreaterThan(0)
    expect(byTimestampAsc(good, undefined)).toBeLessThan(0)
    expect(byTimestampAsc('not a date', good)).toBeGreaterThan(0)
    expect(byTimestampAsc(good, 'not a date')).toBeLessThan(0)
  })

  it('treats two unreadable timestamps as equal rather than unstable', () => {
    expect(byTimestampAsc(undefined, undefined)).toBe(0)
    expect(byTimestampAsc('not a date', undefined)).toBe(0)
  })

  it('orders a list oldest first whatever order it arrived in', () => {
    const a = '2026-04-01T10:00:00+05:30'
    const b = '2026-04-05T10:00:00+05:30'
    const c = '2026-04-09T10:00:00+05:30'
    expect(sorted([c, a, b])).toEqual([a, b, c])
    expect(sorted([a, b, c])).toEqual([a, b, c])
  })

  it('keeps an unreadable entry in the list rather than losing it', () => {
    /*
     * A sort cannot drop a row, but the assertion is here deliberately:
     * the fix for a badly ordered list must never become a filter. A
     * question with an unreadable date is still a question nobody has
     * answered.
     */
    const good = '2026-04-01T10:00:00+05:30'
    const out = sorted([undefined, good])
    expect(out).toHaveLength(2)
    expect(out.at(-1)).toBeUndefined()
  })
})
