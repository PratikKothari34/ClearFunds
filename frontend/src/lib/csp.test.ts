import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * The policy, asserted to exist.
 *
 * `index.html` carried a comment saying the one inline script "must be
 * allowed by SHA-256 hash in the CSP, never with 'unsafe-inline'", and
 * there was no CSP anywhere in the project - the word appeared exactly
 * once in the whole frontend, in that comment. `theme.inline.test.ts`
 * separately asserted the script is the only inline one "so one CSP
 * hash covers the app", which was true of a policy that did not exist.
 * A dead check that reads as a live one.
 *
 * So these tests assert the policy itself, and assert the hash against
 * a digest computed here rather than a copied string. A pasted hash
 * that drifts from the script is the same failure as no policy at all:
 * the script is blocked, the theme is applied after first paint, and a
 * dark-mode resident gets a white flash on every load.
 *
 * WHAT THESE TESTS CANNOT COVER. `frame-ancestors` is ignored in a meta
 * tag and must be a response header, so the clickjacking defence is not
 * assertable from this repo at all - it is in the backend contract.
 * That is stated here so its absence below is not read as an oversight.
 */

const HTML = readFileSync(resolvePath('index.html'), 'utf8')
const VITE_CONFIG_RAW = readFileSync(resolvePath('vite.config.ts'), 'utf8')

/*
 * CODE ONLY. The config EXPLAINS in a comment why the keyword is not
 * used, so matching the raw file for that word finds the explanation
 * and fails. Caught by this test's first run. Comments are stripped so
 * the assertions below read what runs, not what it says about itself.
 */
const VITE_CONFIG = VITE_CONFIG_RAW.replace(
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
  '',
)

function metaCsp(html: string): string {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0])
  const tag = tags.find((t) =>
    /http-equiv\s*=\s*"Content-Security-Policy"/i.test(t),
  )
  return /content\s*=\s*"([^"]*)"/i.exec(tag ?? '')?.[1] ?? ''
}

function headInlineScripts(html: string): string[] {
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? ''
  return [
    ...head.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((m) => m[1] ?? '')
}

/*
 * EVERY occurrence of a directive, not the first.
 *
 * The browser applies the first and ignores the rest, so a duplicate is
 * how a policy gets loosened while the copy a reviewer reads at the top
 * of the string stays strict. An earlier version of these tests matched
 * only the first occurrence with a regex and passed with an external
 * host sitting in a second `img-src` — caught by mutating the file.
 */
function directiveValues(policy: string, directive: string): string[] {
  return policy
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part === directive || part.startsWith(`${directive} `))
    .map((part) => part.slice(directive.length).trim())
}

/** The source tokens that are hosts rather than keywords like `'self'`. */
function externalHosts(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .filter((token) => token !== '' && !token.startsWith("'"))
}

describe('the content security policy', () => {
  const policy = metaCsp(HTML)

  it('exists', () => {
    expect(policy, 'no meta Content-Security-Policy in index.html').not.toBe('')
  })

  it('allows the inline script by its ACTUAL digest', () => {
    /*
     * The digest is computed from the script in the file, so editing
     * one character of the script fails this test instead of silently
     * shipping a blocked script. `npm run csp-hash` regenerates the
     * value for the header the backend serves; this keeps the meta tag
     * in step with it.
     */
    const scripts = headInlineScripts(HTML)
    expect(scripts).toHaveLength(1)
    const digest = createHash('sha256')
      .update(scripts[0] ?? '', 'utf8')
      .digest('base64')
    expect(policy).toContain(`'sha256-${digest}'`)
  })

  it('never permits unsafe-inline or unsafe-eval', () => {
    /*
     * The reason the hash discipline exists. `unsafe-inline` would
     * admit the theme script and every injected one with it, which
     * makes the whole policy decorative.
     */
    expect(policy).not.toContain('unsafe-inline')
    expect(policy).not.toContain('unsafe-eval')
  })

  it('names a directive for every fetch type the app uses', () => {
    /*
     * Asserted as a set of required directives rather than against the
     * whole string, so reordering or adding one does not fail, but
     * dropping one does. `default-src` alone is not enough: a missing
     * `object-src` or `base-uri` is not covered by it in every browser,
     * and `base-uri` is what stops an injected <base> rewriting every
     * relative URL on the page.
     */
    for (const directive of [
      'default-src',
      'script-src',
      'style-src',
      'font-src',
      'img-src',
      'connect-src',
      'object-src',
      'base-uri',
      'form-action',
    ]) {
      expect(
        directiveValues(policy, directive),
        `${directive} must appear exactly once`,
      ).toHaveLength(1)
    }
  })

  it('forbids plugins and a rewritten base URL outright', () => {
    expect(directiveValues(policy, 'object-src')).toEqual(["'none'"])
    expect(directiveValues(policy, 'base-uri')).toEqual(["'none'"])
  })

  it('loads scripts, styles, fonts and images only from this origin', () => {
    /*
     * No CDN, no Google Fonts, no analytics. The fonts are self-hosted
     * and the brand images are local, and a third-party origin on an
     * authenticated screen is a referrer leak as well as a supply-chain
     * one. Asserted per directive, because `default-src 'self'` does
     * not stop a later edit adding a host to `script-src`.
     */
    for (const directive of [
      'script-src',
      'style-src',
      'font-src',
      'img-src',
    ]) {
      const values = directiveValues(policy, directive)
      expect(values, `${directive} appears ${values.length} times`).toHaveLength(
        1,
      )
      const value = values[0] ?? ''
      expect(value, `${directive} is empty`).not.toBe('')
      expect(
        externalHosts(value),
        `${directive} names an external host`,
      ).toEqual([])
    }
  })

  it('is the policy the DEV SERVER relaxes by nonce, never by keyword', () => {
    /*
     * The dev server cannot satisfy the policy above. It injects every
     * stylesheet as a <style> tag from JS, so under `style-src 'self'`
     * the browser refuses the entire stylesheet: the app renders fully
     * functional and completely unstyled, with no build error and
     * nothing in the terminal. The only signal is a console message.
     *
     * The fix must be a nonce, not `'unsafe-inline'`. A keyword makes
     * dev and production run under different policies, so a genuine CSP
     * violation added to a component passes locally and fails for a
     * resident - the dev server stops being a test of the policy at
     * all. These assert the shape of that fix, since nothing else does:
     * the config typechecks and the build passes either way.
     */
    expect(
      VITE_CONFIG,
      "vite.config.ts must not relax the policy with a keyword",
    ).not.toMatch(/unsafe-inline|unsafe-eval/)

    expect(
      VITE_CONFIG,
      'the dev relaxation must be a nonce',
    ).toMatch(/nonce-\$\{/)
  })

  it('generates the dev nonce fresh per server start', () => {
    /*
     * A nonce written as a literal in the config is a constant, and a
     * constant nonce is `'unsafe-inline'` with extra steps: it is in a
     * committed, world-readable file, so anything injected into the page
     * can read it and carry it. Asserted as "derives from a random
     * source", not against a value, because the value must differ every
     * run and a test naming one would have to be wrong.
     */
    expect(VITE_CONFIG).toMatch(/randomBytes\(/)
    expect(
      VITE_CONFIG,
      'the nonce must come from randomBytes, not a literal',
    ).toMatch(/DEV_CSP_NONCE\s*=\s*randomBytes\(/)
  })

  it('keeps the nonce out of a production build', () => {
    /*
     * Two halves, and only the pair is the boundary. The header rewrite
     * must be `apply: 'serve'` so `build` never sees it, and Vite's
     * `html.cspNonce` must be off in production - it stamps a nonce
     * attribute onto every script, style and stylesheet link, including
     * the inline theme script, which changes the bytes the SHA-256 in
     * the shipped header is computed over.
     *
     * With both in place the built HTML carries no nonce anywhere and
     * the inline script is allowed by hash alone, which is what
     * `npm run csp-hash` hands to the backend lane.
     */
    expect(VITE_CONFIG, 'the header rewrite must not run on build').toMatch(
      /apply:\s*'serve'/,
    )
    expect(
      VITE_CONFIG,
      "html.cspNonce must be disabled when mode is production",
    ).toMatch(/mode === 'production'\s*\?\s*\{\}\s*:\s*\{\s*cspNonce/)
  })

  it('restricts where the app may connect, and says where', () => {
    /*
     * The published chain head is fetched from a host outside the
     * committee's control, so `connect-src` is the one directive that
     * legitimately names an external origin. Listing it means adding a
     * second one is a visible change rather than an unnoticed one.
     */
    const values = directiveValues(policy, 'connect-src')
    expect(values).toHaveLength(1)
    const hosts = externalHosts(values[0] ?? '')
    expect(hosts.length).toBeLessThanOrEqual(1)
    for (const host of hosts) {
      expect(host).toMatch(/^https:\/\//)
    }
  })
})
