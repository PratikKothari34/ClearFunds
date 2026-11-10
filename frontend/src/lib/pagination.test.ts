import { describe, expect, it } from 'vitest'
import { MAX_ROWS, PAGE, restPages, walkStep } from './api'

/*
 * `walkStep` and `restPages` were pulled out of `all()` expressly so they
 * could be tested - their own comments say so - and then nothing tested them.
 * That is the worst case of the dead-check class: a guard extracted for
 * testability, documented as the thing standing between a truncated ledger and
 * a wrong running balance, with no test behind it.
 *
 * Both decide whether the app has the WHOLE history. Get either wrong and the
 * ledger silently loses or duplicates a page of entries, and a running balance
 * reports a wrong figure rather than an error - the one failure this product
 * exists to prevent.
 *
 * Every assertion is derived from PAGE and MAX_ROWS, never from 1000 or
 * 500000 written out: an assertion on a literal gets "fixed" by editing the
 * expected number when the page size changes, which deletes the test's meaning
 * while leaving it green.
 */

describe('walkStep(): the sequential walk stops for the right reason', () => {
  it('a short page is the end of the view', () => {
    for (const len of [0, 1, PAGE - 1]) {
      expect(walkStep(len, 0), `len=${len}`).toBe('done')
      // A short page ends the walk wherever it happens, including past the
      // ceiling: there is nothing left to fetch, so there is nothing to refuse.
      expect(walkStep(len, MAX_ROWS + PAGE), `len=${len} past ceiling`).toBe('done')
    }
  })

  it('a full page with room left continues', () => {
    expect(walkStep(PAGE, PAGE)).toBe('continue')
    expect(walkStep(PAGE, MAX_ROWS - PAGE)).toBe('continue')
  })

  it('refuses rather than returning a history it knows is incomplete', () => {
    /*
     * THE POINT OF THE FUNCTION. A full page at the ceiling means the exit
     * condition is never coming. Returning 'done' here would hand the app a
     * truncated ledger labelled complete - the wrong-figure outcome. Anything
     * that is not 'refuse' is that bug.
     */
    expect(walkStep(PAGE, MAX_ROWS + 1)).toBe('refuse')
    expect(walkStep(PAGE, MAX_ROWS * 2)).toBe('refuse')
  })

  it('holds the boundary exactly at the ceiling, not one page either side', () => {
    // Inclusive at the ceiling, refusing the moment it is passed. An off-by-one
    // here either refuses a legitimate read or walks one page too far.
    expect(walkStep(PAGE, MAX_ROWS)).toBe('continue')
    expect(walkStep(PAGE, MAX_ROWS + 1)).toBe('refuse')
  })

  it('never answers "done" for a full page, at any offset', () => {
    /*
     * A full page is direct evidence that more rows may exist, so 'done' is
     * never a defensible answer for one - whatever the offset. This is the
     * general form: it kills a `>=`/`<=` slip and a swapped-branch mutant that
     * the two boundary cases above could miss.
     */
    for (const from of [0, PAGE, MAX_ROWS - 1, MAX_ROWS, MAX_ROWS + 1, MAX_ROWS * 10]) {
      expect(walkStep(PAGE, from), `from=${from}`).not.toBe('done')
    }
  })

  it('treats an over-full page like a full one, never as the end', () => {
    // The server should not return more than asked, but if it does, the one
    // answer that must not come back is "that was everything".
    expect(walkStep(PAGE + 1, PAGE)).toBe('continue')
    expect(walkStep(PAGE + 1, MAX_ROWS + 1)).toBe('refuse')
  })
})

describe('restPages(): planning the parallel reads', () => {
  it('asks for nothing more when the first page was short', () => {
    for (const len of [0, 1, PAGE - 1]) {
      expect(restPages(len, null), `len=${len}`).toEqual([])
      expect(restPages(len, 0), `len=${len}`).toEqual([])
      expect(restPages(len, 10_000), `len=${len}`).toEqual([])
    }
  })

  it('refuses to plan when the server reported no count', () => {
    /*
     * `undefined` is not "nothing to fetch" - it is "we cannot plan", and the
     * caller must fall back to the sequential walk. Returning [] instead would
     * truncate the ledger to its first page and report no error.
     */
    for (const total of [null, undefined, Number.NaN, Infinity, -Infinity]) {
      expect(restPages(PAGE, total as number | null | undefined), String(total)).toBeUndefined()
    }
  })

  it('refuses a count that contradicts the page already read', () => {
    /*
     * A full first page PROVES at least that many rows exist, so a smaller
     * total is nonsense. Before the guard, a total of 0 or -1 took the
     * `pages - 1 = 0` path and returned [] - "that was everything" - and
     * `Math.max(0, ...)` made the truncation look deliberate.
     */
    for (const total of [0, -1, 1, PAGE - 1]) {
      expect(restPages(PAGE, total), `total=${total}`).toBeUndefined()
    }
  })

  it('plans nothing extra when the count is exactly the page just read', () => {
    // Consistent, and complete: one page read, one page exists.
    expect(restPages(PAGE, PAGE)).toEqual([])
  })

  it('asks for one offset per remaining page, starting after the first', () => {
    const got = restPages(PAGE, PAGE * 3)
    expect(got).toEqual([PAGE, PAGE * 2])
    // Never re-reads page one (a duplicated page is a doubled balance) and
    // never starts past the end.
    expect(got).not.toContain(0)
  })

  it('covers every row when the last page is partial', () => {
    /*
     * The rule, not a sample: whatever the total, the offsets must tile the
     * rows after the first page with no gap and no overlap - a gap loses
     * entries, an overlap counts them twice, and both come out as a wrong
     * figure rather than an error.
     */
    for (const extra of [1, 2, PAGE - 1, PAGE, PAGE + 1, PAGE * 7 + 13]) {
      const total = PAGE + extra
      const got = restPages(PAGE, total)
      expect(got, `total=${total}`).toBeDefined()
      const offsets = got!
      // Strictly increasing, one page apart, starting at PAGE.
      expect(offsets, `total=${total}`).toEqual(
        offsets.map((_, i) => (i + 1) * PAGE),
      )
      // The last request begins inside the data...
      expect(offsets.at(-1)!, `total=${total}`).toBeLessThan(total)
      // ...and one more page would begin past the end, so nothing is missing.
      expect(offsets.at(-1)! + PAGE, `total=${total}`).toBeGreaterThanOrEqual(total)
    }
  })

  it('plans no duplicate offsets, at any size', () => {
    for (const total of [PAGE * 2, PAGE * 11, PAGE * 11 + 1, 250_000]) {
      const got = restPages(PAGE, total)!
      expect(new Set(got).size, `total=${total}`).toBe(got.length)
    }
  })

  it('scales to a real society without the plan outgrowing the data', () => {
    // ~11,000 entries is a 150-flat society five years in; the comment in
    // api.ts cites it as the case parallel reads exist for.
    const total = 11_000
    const got = restPages(PAGE, total)!
    expect(got.length).toBe(Math.ceil(total / PAGE) - 1)
  })
})

describe('the two decisions agree about what a complete read is', () => {
  it('neither reports completeness from a full page alone', () => {
    /*
     * The shared invariant, and the thing that makes them one guard: a full
     * page is never by itself evidence that the read finished. `walkStep` must
     * not say 'done' and `restPages` must not say [] - each would hand the app
     * a truncated ledger labelled complete, by a different route.
     */
    expect(walkStep(PAGE, PAGE)).not.toBe('done')
    expect(restPages(PAGE, undefined)).not.toEqual([])
  })

  it('PAGE and MAX_ROWS leave real room between them', () => {
    // The ceiling is a runaway-loop stop, not a cap on a society's history.
    // If it ever fell near PAGE it would start refusing legitimate reads.
    expect(MAX_ROWS).toBeGreaterThan(PAGE * 100)
  })
})
