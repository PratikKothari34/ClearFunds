import { describe, expect, it } from 'vitest'
import { comparedAnything, inChainOrder, reversedRows } from './ledger'
import type { Entry, EntryState } from './types'

/*
 * The three list-shaping rules behind the ledger tabs.
 *
 * Every assertion here is on the RULE, never on a count or an index
 * from the sample. A test reading `expect(rows).toHaveLength(3)` is
 * repaired by editing the 3 the day the fixture changes, which deletes
 * the test while leaving it green.
 */

function entry(
  sequence: number,
  over: Partial<Entry> = {},
): Entry {
  return {
    id: `e-${sequence}`,
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
    ...over,
  }
}

const seqs = (list: readonly Entry[]) => list.map((e) => e.sequence)
const ids = (list: readonly Entry[]) => list.map((e) => e.id)

describe('inChainOrder', () => {
  it('sorts newest first whatever order the server sent', () => {
    /*
     * The fixture's own head was 847, 846, 845, 848 - the newest entry
     * fourth. Array order IS the running-balance claim, so an unsorted
     * list gives two rows reporting the same closing balance.
     */
    const out = inChainOrder([entry(847), entry(846), entry(845), entry(848)])
    expect(seqs(out)).toEqual([848, 847, 846, 845])
  })

  it('reaches the same order from an already-sorted list', () => {
    // Idempotent, so applying it twice cannot reverse anything.
    const once = inChainOrder([entry(3), entry(2), entry(1)])
    expect(seqs(inChainOrder(once))).toEqual(seqs(once))
  })

  it('does not mutate the array it was given', () => {
    /*
     * Routes read the accessor once and pass the same array to this and
     * to a count. An in-place sort would reorder the caller's list as a
     * side effect of rendering.
     */
    const input = [entry(1), entry(3), entry(2)]
    inChainOrder(input)
    expect(seqs(input)).toEqual([1, 3, 2])
  })

  it('puts an unusable sequence last instead of dropping the entry', () => {
    /*
     * Both halves matter. Hiding an entry from the history is the one
     * thing this product must never do, so a bad sequence costs the row
     * its position and nothing else.
     */
    const broken = entry(0, { id: 'e-broken', sequence: NaN })
    const out = inChainOrder([broken, entry(5), entry(9)])
    expect(out).toHaveLength(3)
    expect(ids(out).at(-1)).toBe('e-broken')
  })

  it('puts an unusable sequence last from either input position', () => {
    /*
     * Every comparison against NaN is false in BOTH directions, so a
     * comparison-only comparator leaves the answer dependent on where
     * the bad row happened to sit. Asserted from both ends.
     */
    const broken = entry(0, { id: 'e-broken', sequence: NaN })
    for (const input of [
      [broken, entry(5)],
      [entry(5), broken],
    ]) {
      expect(ids(inChainOrder(input)).at(-1)).toBe('e-broken')
    }
  })

  it('does not treat a fractional sequence as a chain position', () => {
    // Number.isInteger, not isFinite: a chain position is an integer.
    const out = inChainOrder([entry(0, { id: 'e-half', sequence: 1.5 }), entry(2)])
    expect(ids(out).at(-1)).toBe('e-half')
  })

  it('returns an empty list for an empty list', () => {
    expect(inChainOrder([])).toEqual([])
  })
})

describe('reversedRows', () => {
  const reversed = entry(10, {
    id: 'e-10',
    state: 'reversed',
    reversedBy: {
      id: 'e-11',
      sequence: 11,
      postedAt: '2026-04-02T10:00:00+05:30',
    },
  })
  const reversal = entry(11, {
    id: 'e-11',
    state: 'reversal',
    direction: 'in',
    reverses: {
      id: 'e-10',
      sequence: 10,
      postedAt: '2026-04-01T10:00:00+05:30',
    },
    reversalReason: 'Paid to the wrong vendor',
  })

  it('lists a correction once, not as both of its entries', () => {
    /*
     * The bug: admitting the reversal as its own row listed one
     * correction twice - once struck through as money out, once as
     * money in - with the same reason under both. To a resident that
     * reads as twice the movement, on the tab that exists to explain
     * corrections.
     */
    const rows = reversedRows([reversed, reversal])
    expect(ids(rows)).toEqual(['e-10'])
  })

  it('keeps the reversed entry, not the reversal', () => {
    /*
     * Which of the pair survives is the whole point: the page renders
     * the cancelled entry struck through with its reversal linked
     * beside it, so keeping the reversal instead would show the
     * correction without what it corrected.
     */
    const rows = reversedRows([reversal, reversed])
    expect(rows.map((e) => e.state)).toEqual(['reversed'])
  })

  it('keeps an orphan reversal rather than hiding a chain entry', () => {
    /*
     * A filtered or paginated response can split the pair. An orphan
     * explained by a link beats a correction that is simply absent.
     */
    const rows = reversedRows([reversal])
    expect(ids(rows)).toEqual(['e-11'])
  })

  it('keeps a reversal that names no entry at all', () => {
    const headless = entry(12, { id: 'e-12', state: 'reversal' })
    expect(ids(reversedRows([headless]))).toEqual(['e-12'])
  })

  it('excludes states that are not part of a correction', () => {
    /*
     * Asserted over every member of the union rather than the two
     * cases in the sample, so a state added later fails here instead of
     * appearing silently on the corrections tab.
     */
    const states: readonly EntryState[] = [
      'posted',
      'reversed',
      'reversal',
      'pending',
    ]
    const kept = states.filter(
      (state) => reversedRows([entry(1, { state })]).length > 0,
    )
    expect(kept).toEqual(['reversed', 'reversal'])
  })

  it('returns an empty list for an empty list', () => {
    expect(reversedRows([])).toEqual([])
  })
})

describe('comparedAnything', () => {
  it('is false when there is nothing to compare', () => {
    /*
     * This is exactly what a production build holds today. Without it
     * the verify page printed "Newest entry here: None" directly above
     * "Nothing in the history has been changed since it was published."
     * - the product's central claim, made over zero entries.
     */
    expect(comparedAnything([])).toBe(false)
  })

  it('is true once there is an entry to compare', () => {
    expect(comparedAnything([entry(1)])).toBe(true)
  })

  it('is false when no entry has a usable chain position', () => {
    /*
     * A list of rows none of which can be placed in the chain is not a
     * comparison either. `newestEntry` cannot name one, so the page
     * must not claim a match.
     */
    expect(comparedAnything([entry(0, { sequence: NaN })])).toBe(false)
  })
})
