import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * A ROUTE FILE HOLDS NO TESTABLE RULE.
 *
 * Two facts combine into a trap. First, `autoCodeSplitting` rewrites
 * every file under `routes/`, so a test that imports one gets
 * TanStack's lazy wrapper and renders an empty container - silently,
 * with every absence assertion passing against ''. Second,
 * `only-export-components` is switched OFF for `src/routes/**` in
 * .oxlintrc.json, because each route MUST export `Route` beside its
 * component and the linter cannot tell that mandated export from a
 * stray helper. Twenty-one unavoidable warnings hid the one real hit
 * for as long as they were left on.
 *
 * Turning the rule off removed the noise and the signal together. This
 * is the signal, put back where it cannot be drowned: a pure helper
 * written into a route file is logic that will never be tested, which
 * is how the sign-off oldest-month bug survived. It belongs in `lib/`.
 *
 * ASSERTED BY SHAPE, NOT BY COUNT. A test that said "there are exactly
 * seventeen route files" would be corrected by whoever adds the
 * eighteenth, and the rule would leave with the number.
 */

const ROUTES = resolve(process.cwd(), 'src/routes')

/** Source with comments removed, so a comment cannot satisfy a search. */
function sources(): { name: string; code: string }[] {
  return readdirSync(ROUTES)
    .filter((f) => f.endsWith('.tsx'))
    .map((name) => ({
      name,
      code: readFileSync(resolve(ROUTES, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/^\s*\/\/.*$/gm, ''),
    }))
}

describe('route files carry no rule that belongs in lib/', () => {
  it('reads the real route directory', () => {
    // Control: every assertion below is a sweep, and a sweep over an
    // empty list passes. The other tests are vacuous without this.
    const files = sources()
    expect(files.length).toBeGreaterThan(5)
    // `__root.tsx` uses createRootRoute; every other file in here uses
    // createFileRoute. Both are the router declaring a route, which is
    // what this asserts - naming only one of them would have excluded
    // the root route from every sweep below.
    expect(
      files.every(({ code }) => /create(File|Root)Route/.test(code)),
    ).toBe(true)
  })

  it('exports only Route and components', () => {
    /*
     * A capitalised function is a component; `Route` is the router's.
     * Anything else exported from a route file is reachable only
     * through a module the test harness cannot render, so it is logic
     * with no way to assert on it.
     */
    const offenders: string[] = []
    for (const { name, code } of sources()) {
      for (const line of code.split('\n')) {
        const m = /^export\s+(?:const|function|let|var|type|interface|class)\s+(\w+)/.exec(
          line.trim(),
        )
        if (m === null) continue
        const id = m[1] ?? ''
        if (id === 'Route') continue
        if (/^[A-Z]/.test(id) && /^export\s+function/.test(line.trim())) continue
        offenders.push(`${name}: ${line.trim()}`)
      }
    }
    expect(
      offenders,
      'these belong in src/lib/, where they can be tested without a router',
    ).toEqual([])
  })

  it('re-exports nothing', () => {
    // `export { x } from './y'` and `export * from` make a route a
    // module boundary, which is the same problem wearing a hat.
    for (const { name, code } of sources()) {
      expect(code, `${name} re-exports`).not.toMatch(/^export\s*[*{]/m)
    }
  })
})
