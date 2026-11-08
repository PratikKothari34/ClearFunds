import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_ROWS, PAGE, restPages, walkStep } from './api'

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

  it('refuses to plan from a total that contradicts the page just read', () => {
    /*
     * A full first page proves at least PAGE rows exist. A count below that
     * is nonsense, and the dangerous answer is [] - "that was everything" -
     * which would truncate the ledger to one page and report nothing. The
     * running balance would then be computed from rows the device did not
     * have, which is the failure this product exists to prevent.
     */
    for (const bad of [0, 1, PAGE - 1, -1, -PAGE]) {
      expect(restPages(PAGE, bad)).toBeUndefined()
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

/*
 * walkStep is the sequential fallback's stop decision. The loop around it
 * cannot be reached without a network, so without this the ceiling would be
 * an untested guard - something that looks like protection and waves through
 * the case it exists to stop.
 */
describe('walkStep', () => {
  it('stops as soon as a page comes back short', () => {
    // A short page is conclusive wherever it lands, including at the ceiling.
    for (const from of [PAGE, PAGE * 7, MAX_ROWS, MAX_ROWS + PAGE]) {
      expect(walkStep(0, from)).toBe('done')
      expect(walkStep(PAGE - 1, from)).toBe('done')
    }
  })

  it('keeps walking while a full page leaves room under the ceiling', () => {
    for (const from of [PAGE, PAGE * 2, MAX_ROWS]) {
      expect(walkStep(PAGE, from)).toBe('continue')
    }
  })

  it('refuses rather than return a possibly truncated history', () => {
    /*
     * The dangerous answer here is 'done'. Full pages that never run short
     * mean the exit condition is not coming, and answering 'done' would hand
     * back a ledger missing everything past the ceiling while reporting it
     * complete - the running balance would be computed from rows the device
     * never had.
     */
    expect(walkStep(PAGE, MAX_ROWS + PAGE)).toBe('refuse')
    expect(walkStep(PAGE, MAX_ROWS * 2)).toBe('refuse')
  })

  it('puts the ceiling far above any society this product is for', () => {
    // 150 flats appending for decades is tens of thousands of entries, so a
    // refusal must mean something is broken, never that a committee was busy.
    expect(MAX_ROWS).toBeGreaterThan(PAGE * 100)
  })
})

/*
 * Both walks in `api.ts` must ask `walkStep`, and must BRANCH on its answer.
 *
 * `fetchChain` had only a short-page exit, so it was the one walk with no
 * ceiling. That matters most there because it feeds `runCheck`: a short
 * download is a PREFIX of the chain, and a prefix verifies perfectly - the
 * entries that would break it are the ones after the stop. A reachable anchor
 * catches it, but the anchor is unpublished today.
 *
 * Asserting the CALL is not enough - that hole let a mutant survive in the
 * settled-read sweep. Assert the refusal is acted on.
 */
describe('every paginated walk is bounded', () => {
  const src = readFileSync(resolve(__dirname, 'api.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')

  it('found the walks at all', () => {
    // A sweep whose pattern matches nothing reports success forever.
    const loops = src.match(/for\s*\(\s*let\s+from\s*=/g) ?? []
    expect(loops.length, 'no paginated walk found: this guard is not measuring').toBeGreaterThan(1)
  })

  it('has no walk whose only exit is a short page', () => {
    /*
     * The defect's shape: `if (rows.length < PAGE) return` as the sole exit,
     * with no ceiling, so full pages that never run short loop forever or
     * hand back a truncated history as complete.
     */
    const bare = src.match(/if\s*\(\s*\w+\.length\s*<\s*PAGE\s*\)\s*return/g) ?? []
    expect(bare, 'a walk still exits only on a short page, so it has no ceiling').toEqual([])
  })

  it('acts on a refusal rather than only computing one', () => {
    const asks = (src.match(/walkStep\s*\(/g) ?? []).length
    const refuses = (src.match(/===\s*'refuse'/g) ?? []).length
    expect(asks, 'both walks must ask walkStep').toBeGreaterThanOrEqual(2)
    expect(refuses, 'a walkStep answer is computed but never branched on: not a check')
      .toBeGreaterThanOrEqual(2)
    expect(src, 'a refusal must throw, not return what was read so far').toMatch(/'refuse'[\s\S]{0,120}throw/)
  })
})
