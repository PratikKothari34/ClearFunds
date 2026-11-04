/*
 * THE DEMO CREDENTIALS MUST NOT REACH A PRODUCTION BUILD.
 *
 * `DEMO` was dev-gated from the start, so no demo button ever rendered in
 * production - but `demo()` itself was ungated, so the seed account's domain
 * and password survived minification and shipped in the entry chunk. Not a
 * leaked secret (`.test` resolves nowhere, the accounts exist only in a local
 * seed, and this repo is public), but a credential-shaped string sent to every
 * resident's phone, and dead code there besides.
 *
 * This reads the SOURCE, not `dist`: a test that greps the build would pass
 * vacuously on a machine that has not built, and `npm run verify` runs the
 * suite BEFORE the build, so there is no dist to read at that point. What the
 * source can prove is the structural rule the elimination depends on - every
 * occurrence of the literals sits inside something gated on DEMO_ON, and
 * `demo()` refuses when that gate is off.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '../components/Login.tsx')
const src = readFileSync(SRC, 'utf8')

/** Source with comments removed: the prose below names the literals too. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('the demo credentials never reach a production bundle', () => {
  it('finds the gate, so the assertions below are not vacuous', () => {
    // If DEMO_ON is renamed, every assertion that looks for it would pass
    // against nothing. Fail loudly instead.
    expect(code, 'no DEMO_ON gate in Login.tsx').toMatch(/const DEMO_ON\s*=/)
  })

  it('gates the credentials on import.meta.env.DEV, not only on a flag', () => {
    /* VITE_DEMO_LOGINS alone is not enough: an env var set in a hosting
     * dashboard is applied at BUILD time, so a production build would carry
     * the strings. Only `import.meta.env.DEV` is statically false in a
     * production build, which is what lets the bundler eliminate them. */
    const gate = /const DEMO_ON\s*=\s*import\.meta\.env\.DEV\s*&&/
    expect(code, 'DEMO_ON must lead with import.meta.env.DEV').toMatch(gate)
  })

  it('keeps every credential literal behind that gate', () => {
    /* The literals may appear only inside DEMO_AUTH, which is the
     * conditional whose false branch is null. Anywhere else - inline in a
     * handler, in a default, in a fallback - and the bundler keeps them. */
    for (const literal of ['clearfunds-demo', 'gulmohar.test']) {
      const lines = code.split('\n').map((l, i) => [l, i + 1] as const).filter(([l]) => l.includes(literal))
      expect(lines.length, `${literal} appears nowhere in Login.tsx`).toBeGreaterThan(0)
      for (const [, n] of lines) {
        // Walk back to the nearest top-level const and require it to be the
        // gated DEMO_AUTH. A literal in an ungated function fails here.
        const before = code.split('\n').slice(0, n).reverse()
        const owner = before.find((l) => /^const \w+/.test(l))
        expect(owner, `${literal} on line ${n} is not inside a top-level const`).toBeDefined()
        expect(owner, `${literal} on line ${n} escaped the DEMO_AUTH gate`).toMatch(/const DEMO_AUTH\s*=/)
      }
    }
  })

  it('makes DEMO_AUTH null when the gate is off', () => {
    // The null branch is what demo() checks. A `: {}` or a default object
    // would typecheck and silently re-enable the call path.
    expect(code).toMatch(/const DEMO_AUTH\s*=\s*DEMO_ON[\s\S]{0,200}?:\s*null/)
  })

  it('refuses the demo sign-in when the gate is off', () => {
    /* Without this guard the strings are gone but the call still runs, with
     * an undefined credential reaching supabase.auth - a confusing failure
     * instead of no feature. Asserted as a return, not merely a mention of
     * DEMO_AUTH, and the negation is excluded: `if (DEMO_AUTH) return` is the
     * exact inversion and would leave the path live in production only. */
    const fn = /async function demo\([\s\S]*?\n  \}/.exec(code)
    expect(fn, 'no demo() function in Login.tsx').not.toBeNull()
    const body = fn![0]
    expect(body, 'demo() does not bail when the gate is off').toMatch(/if\s*\(\s*!\s*DEMO_AUTH\s*\)\s*return/)
    expect(body, 'the bail condition is inverted').not.toMatch(/if\s*\(\s*DEMO_AUTH\s*\)\s*return/)
  })
})
