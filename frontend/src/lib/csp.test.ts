import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * The dev server must run the REAL production CSP, satisfied by a nonce.
 *
 * Why this file exists: with 'unsafe-inline' in the dev policy, dev and
 * production run different policies and the dev server stops testing the real
 * one. The failure it is there to catch is silent - the app renders fully
 * populated and completely unstyled, with no build error and nothing in the
 * terminal - so nobody discovers it locally. A resident does.
 *
 * COMMENTS ARE STRIPPED BEFORE ANY ASSERTION. vite.config.ts explains the
 * mechanism in prose that names 'unsafe-inline' twice, so a check run over the
 * raw text would fail on correct code, get "fixed" by loosening the pattern,
 * and then pass on broken code. The code is what is asserted on, never the
 * commentary about it.
 */

const raw = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8')

// Block comments, line comments, then string and template literals left
// intact: the policy itself lives in string literals and must survive.
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

describe('vite.config.ts: the dev server runs the production CSP', () => {
  it('strips the commentary that names the keyword, so the check reads code', () => {
    // Guards the stripper itself. Without this, every assertion below could be
    // passing for the wrong reason, or failing on prose.
    expect(raw).toContain('unsafe-inline')
    expect(code).not.toContain('THE DEV SERVER RUNS THE REAL PRODUCTION CSP')
    // Code survived.
    expect(code).toContain('const DEV_CSP')
    expect(code).toContain('html:')
  })

  it('never allows an inline keyword in any directive', () => {
    // 'unsafe-eval' and 'unsafe-hashes' are the same mistake wearing a
    // different hat, so the rule is asserted for the family, not one spelling.
    for (const keyword of ['unsafe-inline', 'unsafe-eval', 'unsafe-hashes']) {
      expect(code, `${keyword} would make the dev policy weaker than production`)
        .not.toContain(keyword)
    }
  })

  it('satisfies script-src and style-src with a nonce instead', () => {
    // The nonce is the whole alternative to the keyword. If it goes, the only
    // way the dev server can render is the keyword coming back.
    expect(code).toMatch(/script-src 'self' 'nonce-\$\{DEV_NONCE\}'/)
    expect(code).toMatch(/style-src 'self' 'nonce-\$\{DEV_NONCE\}'/)
  })

  it('generates the nonce fresh per start, never a fixed string', () => {
    // A hardcoded nonce is a public constant, which is no protection at all.
    expect(code).toMatch(/const DEV_NONCE = randomBytes\(\s*\d+\s*\)/)
    expect(code).not.toMatch(/const DEV_NONCE = ['"`]/)
  })

  it('hands the same nonce to the HTML so injected tags carry it', () => {
    // Without this, the policy is correct and the page is unstyled: the
    // original bug. The header and the markup must use one value.
    expect(code).toMatch(/html:\s*\{\s*cspNonce:\s*DEV_NONCE\s*\}/)
  })

  it('sends the policy as a response header on the dev server only', () => {
    // Anchored to the CSP plugin's own object, because other plugins in this
    // file also carry `apply: 'serve'` - a bare search for it stays green when
    // this plugin loses the guard and starts setting the header on a build.
    const plugin = code.slice(code.indexOf("name: 'cf-dev-csp'"))
    const body = plugin.slice(0, plugin.indexOf('devIdleShutdown'))
    expect(body).toMatch(/apply:\s*'serve'/)
    expect(body).toMatch(/setHeader\(\s*'Content-Security-Policy'\s*,\s*DEV_CSP\s*\)/)
  })

  it('locks down the directives that need no origin at all', () => {
    // Asserted as a rule about each directive rather than a snapshot of the
    // whole policy string, so adding a legitimate origin elsewhere does not
    // make this fail and teach someone to delete it.
    for (const directive of [
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "default-src 'self'",
      "form-action 'self'",
      "font-src 'self'",
    ]) {
      expect(code, `${directive} is missing from DEV_CSP`).toContain(directive)
    }
  })

  it('allows a websocket for HMR but keeps it out of production', () => {
    // ws: is legitimate in dev and must never be in the deployed policy. The
    // backend writes that one, so all this file can assert is that the dev
    // exception is confined to the dev-only constant.
    const start = code.indexOf('const DEV_CSP')
    const end = code.indexOf(".join('; ')", start)
    expect(start, 'DEV_CSP not found').toBeGreaterThan(-1)
    expect(end, 'DEV_CSP array is not terminated').toBeGreaterThan(start)
    const devCsp = code.slice(start, end)
    expect(devCsp).toMatch(/connect-src[^`]*ws:/)
    // Anywhere else in the config, a websocket origin is a policy that would
    // ship. Checked on the comment-stripped code, so prose about ws: is fine.
    expect(code.slice(0, start) + code.slice(end)).not.toContain('ws:')
  })
})
