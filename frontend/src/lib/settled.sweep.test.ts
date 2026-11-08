/**
 * A SETTLED read must never be drawn as progress, and must never be drawn as
 * an absence.
 *
 * Two shapes of the same defect, both found in the tree:
 *
 *   1. `{q.isPending ? <Loading/> : …}` with no error arm, over data read as
 *      `q.data ?? []`. A failed read empties the list and the screen then
 *      renders an EMPTY state - an assertion made from no data. `/year-end`
 *      said "No financial years yet" to an auditor whose read had failed, on
 *      the page gating the one irreversible action in this product;
 *      `/committee` drew a society with nobody seated, on the screen whose
 *      whole job is who may approve; `/sign-off` drew every month unsigned,
 *      showing the president work that may already be done.
 *
 *   2. `if (!q.data) return <Loading/>` - one skeleton standing for "in
 *      flight" and "failed". It shimmers forever, and a permanent skeleton is
 *      indistinguishable from a slow network, so the resident waits, reloads,
 *      and waits again. `/my-flat` and the allocation block of `/entry/$seq`
 *      both had this.
 *
 * This sweeps the tree instead of naming the five files that were wrong, so a
 * NEW route with the same shape fails here rather than being found by hand
 * next time. The per-state rendering of `/my-flat` is asserted in
 * `lookup.test.ts`, which also tests the decision itself.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = resolve(__dirname, '..', 'routes')

const routes = readdirSync(DIR)
  .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
  .map((f) => ({
    file: f,
    src: readFileSync(resolve(DIR, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, ''),
  }))

describe('a settled read is never drawn as progress or as an absence', () => {
  it('found the route files at all', () => {
    /*
     * A sweep whose pattern matches nothing reports success forever. This is
     * the same rule the bundle budget follows: assert the sweep is measuring.
     */
    expect(routes.length, 'no route files found: the sweep is looking in the wrong place')
      .toBeGreaterThan(8)
    expect(routes.some((r) => r.src.includes('<Loading')), 'no route renders <Loading>: the sweep cannot be measuring')
      .toBe(true)
  })

  it('never returns a bare skeleton for a read that may have failed', () => {
    /*
     * `if (!q.data) return <Loading/>`. The guard is the ABSENCE of an error
     * check on that query before the early return, so it reads the pattern
     * rather than a file name.
     */
    const bad: string[] = []
    for (const { file, src } of routes) {
      const re = /if\s*\(\s*!\s*(\w+)\.data\s*\)\s*return\s*<Loading/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const q = m[1]!
        const before = src.slice(0, m.index)
        if (!new RegExp(`${q}\\.isError`).test(before)) bad.push(`${file}: if (!${q}.data) return <Loading…> with no ${q}.isError arm above it`)
      }
    }
    expect(bad, 'a failed read renders as a skeleton that never resolves').toEqual([])
  })

  it('never renders an empty state for a read that may have failed', () => {
    /*
     * The subtler shape: a pending arm, then an EMPTY arm, and no error arm
     * between them. The empty state is a claim about the society, so it may
     * only be reached once the read has actually succeeded.
     */
    const bad: string[] = []
    for (const { file, src } of routes) {
      const re = /(\w+)\.isPending\s*\?\s*<Loading/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const q = m[1]!
        // The ternary chain that follows this pending arm, up to its close.
        const tail = src.slice(m.index, m.index + 400)
        const hasEmpty = /<Empty/.test(tail)
        const hasError = new RegExp(`${q}\\.isError`).test(tail)
        if (hasEmpty && !hasError) {
          bad.push(`${file}: ${q}.isPending ? <Loading> : … <Empty> with no ${q}.isError arm, so a failed read asserts an absence`)
        }
      }
    }
    expect(bad, 'a failed read renders as an empty state: a claim made from no data').toEqual([])
  })

  it('every route that renders a list from `?? []` distinguishes a failed read', () => {
    /*
     * The general form of the `/committee` and `/sign-off` defects. If a
     * route coalesces a query's data to an empty array or map AND renders a
     * pending skeleton for that query, it must also have an error arm: the
     * coalesce is exactly what makes failure look like emptiness.
     */
    const bad: string[] = []
    for (const { file, src } of routes) {
      const coalesced = new Set<string>()
      for (const m of src.matchAll(/\(\s*(\w+)\.data(?:\?\.\w+)?\s*\?\?\s*\[\]\s*\)/g)) coalesced.add(m[1]!)
      for (const q of coalesced) {
        if (!new RegExp(`${q}\\.isPending\\s*\\?\\s*<Loading`).test(src)) continue
        /*
         * Passing the whole query to `lookup()` hands it the error check, and
         * that decision is tested directly, so it counts - but only if the
         * ANSWER is then rendered per-state. Asserting the call alone left a
         * hole: reverting the card to `{!d ? <Loading/>}` keeps `lookup(dues`
         * in the file, and the exemption waved the revert through. A call
         * whose result nothing branches on is not a check.
         */
        if (new RegExp(`lookup\\(\\s*${q}\\b`).test(src) && /state === 'failed'/.test(src)) continue
        if (!new RegExp(`${q}\\.isError`).test(src)) {
          bad.push(`${file}: ${q}.data ?? [] is rendered with a pending skeleton but no ${q}.isError arm, so a failed read reads as empty`)
        }
      }
    }
    expect(bad, 'a failed read is rendered as an empty list').toEqual([])
  })

  it('the five routes this class was found in still handle their error state', () => {
    /*
     * The patterns above are deliberately narrow, so that they do not fail on
     * unrelated code. This pins the five known instances by name as well: a
     * rewrite that moves the shape out of the patterns' reach still has to
     * keep the behaviour.
     */
    const want: Array<[string, RegExp]> = [
      /*
       * `/my-flat` asks `lookup()`, which owns the pending/failed/absent
       * decision and is tested directly in `lookup.test.ts`. Delegating to
       * that is BETTER than an inline `dues.isError`, so the named case
       * accepts either - it asserts the question is asked, not where.
       *
       * The delegated form requires the ANSWER to be branched on, not just
       * the call to be present: a mutant that reverted the card to
       * `{!d ? <Loading/>}` left `lookup(dues` in the file and survived an
       * earlier version of this line. The route's own ledger read is checked
       * inline, below.
       */
      ['my-flat.tsx', /dues\.isError|lookup\(dues[\s\S]*state === 'failed'/],
      ['my-flat.tsx', /ledger\.isError/],
      ['entry.$seq.tsx', /q\.isError/],
      ['year-end.tsx', /years\.isError/],
      ['sign-off.tsx', /signoffs\.isError/],
      ['committee.tsx', /c\.isError/],
    ]
    for (const [file, re] of want) {
      const r = routes.find((x) => x.file === file)
      expect(r, `${file} is gone: this sweep's named case needs updating`).toBeDefined()
      expect(r!.src, `${file} no longer distinguishes a failed read (${re})`).toMatch(re)
      expect(r!.src, `${file} no longer offers a retry on a failed read`).toMatch(/<Failed/)
    }
  })
})
