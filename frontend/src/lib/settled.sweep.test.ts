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
        /*
         * This `continue` is why `/committee`'s Auditors card went unseen for
         * so long. It exempts a coalesced query that renders no pending
         * skeleton of its OWN - but the shape does not need one to lie. That
         * card read `(years.data ?? [])`, printed "No auditor appointed yet"
         * when nothing matched, and had no arm of any kind for `years`: the
         * route's single error arm covers a different query entirely, so the
         * exemption waved through the one file the sweep already names.
         *
         * The exemption stays, because a coalesced read that renders no state
         * at all is usually feeding a lookup rather than a claim. The
         * negative-claim sweep below is what closes the hole, and it does not
         * depend on a skeleton being present.
         */
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

  it('never renders a NEGATIVE CLAIM from a coalesced read', () => {
    /*
     * The shape the test above exempts, and the one that survived in
     * `/committee`: a sentence asserting that the society has none of
     * something, rendered from `(q.data ?? [])` with no state check on `q`.
     *
     * A skeleton is not required for the lie - "No auditor appointed yet" was
     * printed straight from an empty coalesce - so this reads the CLAIM
     * rather than the loading arm. The wording is what makes it a claim:
     * these are statements about the society, not labels on a control.
     *
     * The fix is to decide in lib/ from the query's own flags and render the
     * states apart, which is why delegating to a decider counts as handling
     * it: the route then branches on `kind`, and the decision has its own
     * test. Asserting the call alone would be the hole `lookup` already
     * taught us about, so the branch must be present too.
     */
    const CLAIMS = /(?:No|Nobody|Nothing|None)\b[^<>{}]{0,60}?\b(?:yet|appointed|seated|recorded|disputed|outstanding|due|signed|closed|pending|waiting)\b/i
    const bad: string[] = []
    for (const { file, src } of routes) {
      const coalesced = new Set<string>()
      for (const m of src.matchAll(/\(\s*(\w+)\.data(?:\?\.\w+)?\s*\?\?\s*\[\]\s*\)/g)) coalesced.add(m[1]!)
      if (!coalesced.size) continue
      if (!CLAIMS.test(src)) continue
      for (const q of coalesced) {
        /*
         * A `useMemo` DEPENDENCY ARRAY is not a decision - it is bookkeeping,
         * and `[limit.data, limit.isPending, limit.isError]` sitting beside a
         * reverted render satisfied the naive `limit.isError` test below. That
         * is how the first version of this sweep passed on a restored
         * `(limit.data?.history ?? [])`. Dependency arrays are stripped before
         * anything is credited as a check.
         */
        const decisive = src.replace(/,\s*\[[^[\]]*?\.(?:isError|isPending|data)[^[\]]*?\]\s*,?\s*\)/g, ')')
        const checked =
          new RegExp(`${q}\\.isError`).test(decisive) ||
          // Delegated: the decider is handed the query's flags AND the route
          // branches on the answer's state rather than on the rows alone.
          (new RegExp(`${q}\\.isError\\s*[,}]`).test(decisive) && /\.kind === '/.test(decisive)) ||
          new RegExp(`isError:\\s*${q}\\.isError`).test(decisive) ||
          /*
           * Delegated whole: `derivedRead(items, [a, b, c])` is handed the
           * QUERY OBJECTS, so the flags never appear by name. The query must
           * be in a `derivedRead`/`listRead` argument list AND the route must
           * branch on a `kind`, for the same reason the `lookup` exemption
           * requires it: a call whose answer nothing branches on is not a
           * check, and reverting the render would otherwise leave the call in
           * the file and survive.
           */
          (new RegExp(`(?:derived|list)Read(?:Map)?\\([^)]*\\b${q}\\b`).test(decisive) && /\.kind === '/.test(decisive)) ||
          /*
           * The same, collected first: a role-gated site pushes only the
           * reads this viewer relies on, then hands the array over. Requires
           * the push, the handover and the branch - all three.
           */
          (new RegExp(`relied\\.push\\([^)]*\\b${q}\\b`).test(decisive) &&
            /(?:derived|list)Read\([^)]*relied/.test(decisive) &&
            /\.kind === '/.test(decisive))
        if (!checked) {
          bad.push(`${file}: a "none" claim is rendered beside (${q}.data ?? []) with no state check on ${q}, so a failed read asserts an absence`)
        }
      }
    }
    expect(bad, 'a negative claim about the society is made from a read that may have failed').toEqual([])
  })

  it('does not credit a useMemo dependency array as an error check', () => {
    /*
     * The stripping above is the whole reason the `/committee` limit-history
     * revert is catchable, and a regex that stopped stripping would retire it
     * silently while every assertion stayed green. So the strip is asserted on
     * its own: the flags inside a dependency array go, the ones in a decision
     * stay.
     */
    const strip = (s: string) => s.replace(/,\s*\[[^[\]]*?\.(?:isError|isPending|data)[^[\]]*?\]\s*,?\s*\)/g, ')')

    const bookkeeping = `const r = useMemo(() => f(q.data ?? []), [q.data, q.isPending, q.isError])`
    expect(strip(bookkeeping)).not.toMatch(/q\.isError/)

    /*
     * The MULTI-LINE form, with the trailing comma prettier adds - which is
     * how every `useMemo` in this tree is actually written. The first version
     * of this strip handled only the single-line shape above, so the real
     * `/committee` dependency array survived and credited the query; the
     * revert mutant then passed the sweep. A fixture that does not match the
     * formatting in the tree is not a guard.
     */
    const multiline = [
      'const r = useMemo(',
      '    () => f(q.data ?? []),',
      '    [q.data, q.isPending, q.isError],',
      '  )',
    ].join('\n')
    expect(strip(multiline), 'a multi-line dependency array still credits the query')
      .not.toMatch(/q\.isError/)

    // A real check must survive the strip, including one that also has a
    // dependency array after it.
    expect(strip(`{q.isError ? <Failed/> : null}`)).toMatch(/q\.isError/)
    expect(strip(`const a = useMemo(() => g({ isError: q.isError }), [q.data, q.isError])`))
      .toMatch(/isError: q\.isError/)
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
