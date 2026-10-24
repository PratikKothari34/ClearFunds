import { describe, expect, it } from 'vitest'
import { newestEntry } from './ledger'
import type { Entry } from './types'

/*
 * `newestEntry` backs the verify page, which names which entry was
 * compared against the published chain head. That is the one surface
 * where a confidently wrong answer undermines the product's central
 * claim, so the ordering rule gets asserted rather than assumed.
 *
 * These assert the RULE - highest `sequence` wins, whatever the array
 * order - not a position in a sample. An assertion on `entries[0]`
 * would pass while the list happened to arrive sorted and would be
 * "fixed" by editing the expected index the day it stopped.
 */

// Fully typed, with no cast: a cast here would hide a field renamed in
// `Entry` and leave the test asserting against a shape the app no
// longer uses.
function entry(sequence: number, id = `e-${sequence}`): Entry {
  return {
    id,
    sequence,
    postedAt: '2026-04-01T10:00:00+05:30',
    narration: 'Lift maintenance',
    payee: 'Otis Elevator Co',
    amount: { minor: 125075, currency: 'INR' },
    direction: 'out',
    state: 'posted',
    balanceAfter: { minor: 0, currency: 'INR' },
    openFlagCount: 0,
    fingerprint: 'abcd1234',
  }
}

describe('newestEntry', () => {
  it('picks the highest sequence, not the first element', () => {
    /*
     * The bug this exists to prevent. `entries[0]` is only the newest
     * while the list happens to arrive sorted newest-first, and nothing
     * in the wire contract promises that. The assumption is invisible
     * exactly as long as it holds.
     */
    const out = newestEntry([entry(3), entry(9), entry(5)])
    expect(out?.sequence).toBe(9)
  })

  it('finds the newest when it arrives last', () => {
    // Oldest-first is the other plausible server order.
    expect(newestEntry([entry(1), entry(2), entry(3)])?.sequence).toBe(3)
  })

  it('finds the newest when it arrives first', () => {
    // Must still be right when the naive `entries[0]` would also work,
    // or the test only proves the fallback path.
    expect(newestEntry([entry(3), entry(2), entry(1)])?.sequence).toBe(3)
  })

  it('consults the first element rather than accepting it unchecked', () => {
    /*
     * The shape that bit `worstOpinion`: a reducer written
     * `acc === undefined || rank(x) > rank(acc)` short-circuits, so the
     * first element is taken without its value ever being compared. The
     * symptom is an answer that depends on array order, so the check is
     * that reversing the input does not change the result.
     */
    const forward = newestEntry([entry(4), entry(7)])
    const backward = newestEntry([entry(7), entry(4)])
    expect(forward?.sequence).toBe(7)
    expect(backward?.sequence).toBe(7)
  })

  it('returns undefined for an empty ledger rather than throwing', () => {
    /*
     * A society on its first day has no entries. The verify page must
     * render "nothing to compare yet" rather than crashing the route
     * that carries the security claim.
     */
    expect(newestEntry([])).toBeUndefined()
  })

  it('handles a single entry', () => {
    expect(newestEntry([entry(1)])?.sequence).toBe(1)
  })

  it('does not assume sequence starts at zero or one', () => {
    // A society migrating from a paper register may open at any
    // sequence the backend assigns.
    expect(newestEntry([entry(8412), entry(8410)])?.sequence).toBe(8412)
  })

  it('keeps the first of two entries sharing a sequence', () => {
    /*
     * Two entries cannot share a chain position, so this is a malformed
     * payload rather than a real case. It is asserted only to pin the
     * behaviour as deterministic: a strict `>` keeps the earlier one, so
     * the verify page names the same entry on every render instead of
     * changing its answer between reloads.
     */
    const out = newestEntry([entry(5, 'first'), entry(5, 'second')])
    expect(out?.id).toBe('first')
  })
})
