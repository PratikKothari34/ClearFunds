import { describe, expect, it } from 'vitest'
import { PAGE, restPages } from './api'

/*
 * restPages plans the parallel half of the ledger read.
 *
 * Every assertion here is written against PAGE rather than against the number
 * PAGE happens to be, so changing the page size cannot make a stale expected
 * number the thing that fails.
 *
 * The failure this guards is not an exception. Plan one page too few and the
 * ledger quietly loses a thousand entries; one too many and a page repeats.
 * Either way the chain still verifies - every row present is genuine - and the
 * running balance is simply wrong, which is the class this product exists to
 * make impossible.
 */
describe('restPages', () => {
  it('asks for nothing more when the first page was short', () => {
    expect(restPages(0, 0)).toEqual([])
    expect(restPages(1, 1)).toEqual([])
    expect(restPages(PAGE - 1, PAGE - 1)).toEqual([])
  })

  it('asks for nothing more when the total is exactly one full page', () => {
    // The boundary: a full first page is not evidence of a second one.
    expect(restPages(PAGE, PAGE)).toEqual([])
  })

  it('asks for one more page when a single row spills past the first', () => {
    expect(restPages(PAGE, PAGE + 1)).toEqual([PAGE])
  })

  it('covers every row exactly once, with no gap and no repeat', () => {
    // Walk a range of totals rather than assert one case: an off-by-one in
    // the ceil only shows up at particular remainders.
    for (const total of [PAGE, PAGE + 1, PAGE * 2 - 1, PAGE * 2, PAGE * 2 + 1, PAGE * 11, PAGE * 11 + 7]) {
      const offsets = restPages(PAGE, total)!
      const ranges = [0, ...offsets]

      // Contiguous, ascending, one page apart.
      expect(ranges).toEqual([...ranges].sort((a, b) => a - b))
      expect(new Set(ranges).size).toBe(ranges.length)
      for (let i = 1; i < ranges.length; i++) expect(ranges[i]! - ranges[i - 1]!).toBe(PAGE)

      // The planned pages reach the last row and do not start beyond it.
      const last = ranges[ranges.length - 1]!
      expect(last).toBeLessThan(total)
      expect(last + PAGE).toBeGreaterThanOrEqual(total)
    }
  })

  it('refuses to plan when the server reported no count', () => {
    // undefined is NOT the same answer as []. [] says "that was everything",
    // which would return a truncated ledger as though it were complete; the
    // caller reads undefined as "walk in sequence instead".
    for (const missing of [undefined, null, NaN, Infinity]) {
      expect(restPages(PAGE, missing as number | null | undefined)).toBeUndefined()
    }
  })

  it('still reports a short first page as complete even with no count', () => {
    // Order matters: a short page is conclusive on its own, so it must be
    // answered before the missing-count check.
    expect(restPages(PAGE - 1, undefined)).toEqual([])
  })

  it('never returns a negative or zero offset', () => {
    // A 0 offset would re-fetch the page already in hand and double its rows.
    for (const total of [PAGE, PAGE * 3, PAGE * 3 + 1]) {
      for (const from of restPages(PAGE, total)!) expect(from).toBeGreaterThanOrEqual(PAGE)
    }
  })
})
