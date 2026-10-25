import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THE DEV SERVER MUST RUN THE REAL PRODUCTION POLICY.
 *
 * The production CSP has no 'unsafe-inline'. The dev server injects every
 * stylesheet as a <style> tag, so under that policy the app renders FULLY
 * POPULATED AND COMPLETELY UNSTYLED - with no build error and nothing in the
 * terminal. The fix is a per-start random nonce, never the keyword.
 *
 * Fixing it with 'unsafe-inline' would make dev and production run different
 * policies, and the dev server would stop testing the real one. That is the
 * failure this guard exists to prevent.
 *
 * IT MUST STRIP COMMENTS FIRST. The config's own comment names the keyword
 * in order to warn against it, so a naive search of the raw file matches the
 * warning and fails on correct code. A guard that fires on the correct state
 * gets disabled, which is worse than no guard.
 */

const CONFIG = join(import.meta.dirname, '..', '..', 'vite.config.ts')

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('the dev CSP', () => {
  const raw = readFileSync(CONFIG, 'utf8')
  const code = withoutComments(raw)

  it('never allows unsafe-inline or unsafe-eval in executable config', () => {
    for (const keyword of ['unsafe-inline', 'unsafe-eval']) {
      expect(
        code,
        `'${keyword}' in the dev policy means the dev server stops testing the production policy, and the real CSP breaks only once deployed`,
      ).not.toContain(keyword)
    }
  })

  it('still finds the keyword in the raw file, proving comments were stripped', () => {
    /*
     * A tripwire on the guard itself. If the config's warning comment is
     * ever reworded away, this fails and says so - at which point the
     * comment-stripping above is load-bearing for no reason and the previous
     * assertion has become a different, weaker test than it looks.
     */
    expect(
      raw.includes('unsafe-inline'),
      'the config no longer mentions unsafe-inline even in a comment, so the stripping step is now untested - re-check that the assertion above would still catch a real one',
    ).toBe(true)
  })

  it('serves a nonce rather than a keyword', () => {
    expect(code).toContain('cspNonce')
    expect(code).toMatch(/nonce-\$\{/)
  })

  it('generates the nonce randomly per start, not from a fixed string', () => {
    /*
     * Asserts the CALL, not the import. Mutation-tested: replacing the call
     * with a fixed string left `import { randomBytes }` sitting at the top of
     * the file, so a bare /randomBytes/ search passed on a nonce that had
     * become a permanent bypass.
     */
    expect(
      code,
      'a hardcoded nonce is a permanent bypass: anything that learns it can inject a style or script the policy then trusts',
    ).toMatch(/=\s*randomBytes\s*\(/)
  })

  it('applies the dev header only when serving, never to a build', () => {
    expect(
      code,
      "without apply: 'serve' the dev plugin could affect a production build, which must carry the backend's policy instead",
    ).toContain("apply: 'serve'")
  })

  it('keeps the directives that make the policy worth having', () => {
    /*
     * Asserted as rules, not as one long literal string: a snapshot of the
     * whole header gets "fixed" by pasting in whatever the file now says,
     * which deletes the test's meaning while leaving it green.
     */
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ]) {
      expect(code, `${directive} is missing from the dev policy`).toContain(
        directive,
      )
    }
  })
})
