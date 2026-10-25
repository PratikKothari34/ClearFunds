import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * The deploy configuration, checked against the app it deploys.
 *
 * `vercel.json` lives outside this package and nothing imports it, so
 * nothing else in the suite would notice it going stale. Three things
 * in it are load-bearing and each fails SILENTLY - the site builds,
 * deploys green, and is wrong in a way no build log mentions.
 *
 * Paths are resolved from the frontend package root, which is where
 * vitest runs, so the repo root is one level up.
 */

const ROOT = resolve('..')
const VERCEL = JSON.parse(
  readFileSync(resolve(ROOT, 'vercel.json'), 'utf8'),
) as {
  outputDirectory?: string
  buildCommand?: string
  rewrites?: readonly { source: string; destination: string }[]
  headers?: readonly {
    source: string
    headers: readonly { key: string; value: string }[]
  }[]
}

const INDEX_HTML = readFileSync(resolve('index.html'), 'utf8')

describe('the SPA rewrite', () => {
  it('sends unknown paths to index.html, or every deep link 404s', () => {
    /*
     * TanStack file routing is client-side. `/committee` and
     * `/ledger/flagged` exist only once the bundle has booted, so a
     * hard refresh or a pasted link asks Vercel for a file that was
     * never built.
     *
     * Without this rewrite the product is reachable only by landing
     * on `/` and clicking - which breaks exactly the thing this
     * ledger is for: a resident sending a neighbour a link to an
     * entry.
     */
    const catchAll = VERCEL.rewrites?.find((r) => r.destination === '/index.html')
    expect(catchAll).toBeDefined()
    expect(catchAll!.source).toBe('/(.*)')
  })
})

describe('the output directory', () => {
  it('matches where vite actually writes the build', () => {
    /*
     * Vite's default `outDir` is `dist`, relative to the package. The
     * repo root is one level above, so Vercel must be told
     * `frontend/dist`. Point it at `dist` and the deploy succeeds with
     * an empty site.
     *
     * Asserted against the CONFIG rather than a hardcoded string, so
     * setting a custom outDir later fails this instead of shipping a
     * blank page.
     */
    const vite = readFileSync(resolve('vite.config.ts'), 'utf8')
    const custom = /outDir:\s*['"]([^'"]+)['"]/.exec(vite)
    const dir = custom?.[1] ?? 'dist'
    expect(VERCEL.outputDirectory).toBe(`frontend/${dir}`)
  })

  it('builds from inside the frontend package', () => {
    // The repo root has no package.json of its own; a build command
    // that does not enter `frontend/` finds no scripts at all.
    expect(VERCEL.buildCommand).toContain('frontend')
    expect(VERCEL.buildCommand).toContain('build')
  })
})

describe('the hashed assets are immutable', () => {
  it('caches /assets for a year, because the filenames carry a hash', () => {
    /*
     * Vite fingerprints everything under `/assets`, so the bytes at a
     * given URL never change and a long immutable cache is correct
     * rather than risky. Without it every repeat visit on a 4G phone
     * re-downloads the React and TanStack chunks - about 107 KB
     * gzipped that the budget already counts as "vendor cached".
     *
     * The budget script reports a repeat-visit time that assumes this
     * header exists. Dropping it makes that number a fiction.
     */
    const assets = VERCEL.headers?.find((h) => h.source.startsWith('/assets'))
    expect(assets).toBeDefined()
    const cc = assets!.headers.find((h) => h.key === 'Cache-Control')
    expect(cc?.value).toContain('immutable')
  })

  it('does not cache index.html, which is how a deploy reaches anyone', () => {
    /*
     * index.html is the ONE file whose URL is stable while its
     * contents change every deploy: it names the current hashed
     * bundles. Cached, a returning resident keeps loading the old
     * entry point and never sees a release - including a release that
     * fixes a wrong figure.
     *
     * The catch-all header block must therefore carry no
     * Cache-Control at all, leaving Vercel's default revalidation in
     * place.
     */
    const catchAll = VERCEL.headers?.find((h) => h.source === '/(.*)')
    expect(catchAll).toBeDefined()
    const keys = catchAll!.headers.map((h) => h.key)
    expect(keys).not.toContain('Cache-Control')
  })
})

describe('the CSP survives deployment', () => {
  it('is a meta tag, so it ships with the page and needs no header', () => {
    /*
     * THE CSP IS IN index.html, NOT IN vercel.json, AND THAT IS
     * DELIBERATE.
     *
     * The policy pins a SHA-256 of the inline theme script. Split
     * across two files, the hash in the header and the script in the
     * HTML drift the moment one is edited - and the symptom is the
     * theme script being blocked, which shows up as a white flash for
     * dark-mode residents and nothing in any log.
     *
     * In the meta tag they cannot drift: `npm run csp-hash` reads the
     * built HTML and the policy is in the same file as the script it
     * describes.
     *
     * This asserts the policy is present and strict. A `vercel.json`
     * header duplicating it would be the regression.
     */
    expect(INDEX_HTML).toContain('http-equiv="Content-Security-Policy"')
    expect(INDEX_HTML).toContain("script-src 'self' 'sha256-")

    const headerKeys = (VERCEL.headers ?? []).flatMap((h) =>
      h.headers.map((x) => x.key.toLowerCase()),
    )
    expect(headerKeys).not.toContain('content-security-policy')
  })

  it('never relaxes to unsafe-inline on the way to production', () => {
    /*
     * MEASURED ON THE POLICY, NOT ON THE FILE.
     *
     * The first version of this grepped the whole of index.html and
     * failed - because a COMMENT in the head says the inline script is
     * allowed by hash "never with 'unsafe-inline'". The warning
     * tripped the check that enforces it.
     *
     * `csp.test.ts` already hit this and already solved it: strip the
     * comments, then match. Same fix here, for the same reason. A
     * check that cannot survive being documented is a check someone
     * will delete.
     */
    const stripped = INDEX_HTML.replace(/<!--[\s\S]*?-->/g, '')

    /*
     * ANCHORED TO THE CSP TAG, which the first attempt was not: a bare
     * /content="..."/ matched the VIEWPORT meta - the first content
     * attribute in the document - and asserted that
     * "width=device-width, initial-scale=1.0" contains no
     * unsafe-inline, which is true of almost any string and proves
     * nothing. It failed only because the anchor assertion below
     * caught it.
     *
     * So the match starts at http-equiv and takes the content that
     * follows it.
     */
    const policy = /http-equiv="Content-Security-Policy"\s*content="([^"]*)"/.exec(
      stripped.replace(/\s*\n\s*/g, ' '),
    )?.[1]

    expect(policy).toBeDefined()

    // The anchor: this is the real policy and not another attribute
    // that happens to contain no forbidden keyword.
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("object-src 'none'")

    expect(policy).not.toContain('unsafe-inline')
    expect(policy).not.toContain('unsafe-eval')
  })
})
