import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * The font payload is a budget line, not a styling detail: the design is
 * written against mid-range Android on patchy 4G. These tests assert the
 * three facts that are easy to break by accident —
 *
 *   1. Devanagari is not in the default payload.
 *   2. Every declared src actually exists in public/.
 *   3. Every face swaps rather than blocking first paint.
 *
 * Breaking any of them is invisible locally on a fast connection.
 */

const FONTS = readFileSync(resolve('src/styles/fonts.css'), 'utf8')
const DEVANAGARI = readFileSync(
  resolve('src/styles/fonts.devanagari.css'),
  'utf8',
)
const INDEX = readFileSync(resolve('src/index.css'), 'utf8')
const HTML = readFileSync(resolve('index.html'), 'utf8')
const TOKENS = readFileSync(resolve('src/styles/tokens.css'), 'utf8')

function srcUrls(css: string): string[] {
  return [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1] ?? '')
}

/** Every @font-face block that declares a src (not a fallback override). */
function webfaceBlocks(css: string): string[] {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)]
    .map((m) => m[1] ?? '')
    .filter((b) => b.includes('url('))
}

describe('the default font payload', () => {
  it('does not import Devanagari', () => {
    // Noto Sans Devanagari is 104 KB across its two weights, twice the
    // whole Latin payload. Importing it by default charges every
    // English-reading resident for a locale they do not use.
    expect(INDEX).not.toContain('fonts.devanagari')
    // The src urls, not the file text: fonts.css names Devanagari in a
    // comment explaining why it is absent, and a test that forbids the
    // word punishes the explanation.
    for (const url of srcUrls(FONTS)) expect(url).not.toContain('devanagari')
  })

  it('does not import a Fontsource stylesheet, which carries every subset', () => {
    /*
     * The IMPORTS, not the word - the same correction the Devanagari
     * test above already carries. @fontsource/*\/index.css covers
     * Cyrillic, Greek and Vietnamese, and importing one is what this
     * forbids. An earlier version matched the bare string and went red
     * when a comment in fonts.css was expanded to record that the
     * woff2 files are copied from those packages and byte-match them -
     * punishing the explanation, exactly as the Devanagari case did.
     * The packages stay in package.json as the provenance and the
     * refresh path; what must never happen is their CSS entering the
     * graph.
     */
    for (const src of [INDEX, FONTS]) {
      expect(src).not.toMatch(/@import[^;]*@fontsource/)
      expect(src).not.toMatch(/from\s*['"]@fontsource/)
      expect(src).not.toMatch(/require\(\s*['"]@fontsource/)
    }
    // No face may be served out of node_modules either, which is the
    // other way a subset arrives: the declared urls are all /fonts/.
    for (const url of srcUrls(FONTS)) {
      expect(url).not.toContain('node_modules')
      expect(url).not.toContain('@fontsource')
    }
  })

  it('declares only the Latin faces the design names', () => {
    const families = new Set(
      [...FONTS.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]),
    )
    expect(families).toContain('Source Sans 3')
    expect(families).toContain('Source Serif 4')
    expect(families).not.toContain('Noto Sans Devanagari')
  })

  it('stays under 64 KB over the wire', () => {
    // woff2 is already compressed, so the file size IS the transfer size.
    // The ceiling is deliberately close to the current 51 KB: a third
    // face or a second serif weight should have to be argued for.
    const total = srcUrls(FONTS)
      .map((u) => statSync(resolve('public', u.replace(/^\//, ''))).size)
      .reduce((a, b) => a + b, 0)
    expect(total).toBeLessThan(64 * 1024)
  })
})

describe('every declared face', () => {
  it('points at a file that exists', () => {
    // A renamed or un-copied woff2 fails silently: the fallback renders
    // and nothing in the console says the brand face is missing.
    const urls = [...srcUrls(FONTS), ...srcUrls(DEVANAGARI)]
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      const path = resolve('public', url.replace(/^\//, ''))
      expect(existsSync(path), `${url} is declared but not in public/`).toBe(
        true,
      )
    }
  })

  it('swaps rather than blocking first paint', () => {
    // Without swap the text is invisible for up to 3s on a slow
    // connection, which on this product means a blank balance.
    for (const block of [...webfaceBlocks(FONTS), ...webfaceBlocks(DEVANAGARI)]) {
      expect(block).toMatch(/font-display:\s*swap/)
    }
  })

  it('is self-hosted, never a remote origin', () => {
    // A request to a font CDN from an authenticated screen leaks a
    // referrer identifying the society.
    for (const url of [...srcUrls(FONTS), ...srcUrls(DEVANAGARI)]) {
      expect(url).toMatch(/^\/fonts\//)
    }
  })

  it('declares a unicode-range, so a face is not claimed for text it lacks', () => {
    // Source Sans 3 has no Devanagari glyphs. Claiming the range would
    // suppress the fallback and render tofu instead of Hindi.
    for (const block of [...webfaceBlocks(FONTS), ...webfaceBlocks(DEVANAGARI)]) {
      expect(block).toMatch(/unicode-range:/)
    }
  })

  it('covers the rupee sign in the Latin faces', () => {
    // U+20B9. Every amount on every screen starts with it; omitting it
    // from the range falls back mid-string and the glyph does not match
    // the digits beside it.
    for (const block of webfaceBlocks(FONTS)) {
      expect(block).toMatch(/U\+20B9/)
    }
  })
})

describe('the font stacks', () => {
  it('put the metric-matched fallback before the generic family', () => {
    // An override family with no local face resolves to nothing, so it
    // must sit in front of a real fallback, not replace it.
    const sans = /--cf-sans:([^;]+);/.exec(TOKENS)?.[1] ?? ''
    expect(sans).toContain('Source Sans 3 Fallback')
    expect(sans.indexOf('Source Sans 3 Fallback')).toBeLessThan(
      sans.indexOf('sans-serif'),
    )
    expect(sans).toMatch(/sans-serif\s*$/)
  })

  it('keeps Devanagari in the stack so a locale switch needs no CSS change', () => {
    const sans = /--cf-sans:([^;]+);/.exec(TOKENS)?.[1] ?? ''
    expect(sans).toContain('Noto Sans Devanagari')
  })

  it('declares a fallback override for every metric-matched family used', () => {
    for (const family of ['Source Sans 3 Fallback', 'Source Serif 4 Fallback']) {
      expect(FONTS).toContain(`font-family: '${family}'`)
    }
  })
})

describe('preload hints', () => {
  const preloads = [
    ...HTML.matchAll(/<link[^>]*rel="preload"[^>]*href="([^"]+)"[^>]*>/g),
  ].map((m) => m[1] ?? '')

  it('preload only fonts the first paint actually uses', () => {
    // A preload for an unused font competes with the ledger payload on
    // the same connection and Chrome warns about it.
    expect(preloads.length).toBeGreaterThan(0)
    expect(preloads.length).toBeLessThanOrEqual(2)
    for (const p of preloads) expect(p).toMatch(/^\/fonts\/source-sans-3-latin/)
  })

  it('never preload Devanagari', () => {
    for (const p of preloads) expect(p).not.toContain('devanagari')
  })

  it('carry crossorigin, without which the font is fetched twice', () => {
    // A font preload without crossorigin is not matched to the CSS
    // request, so the browser downloads the file a second time.
    const tags = [...HTML.matchAll(/<link[^>]*rel="preload"[\s\S]*?\/>/g)].map(
      (m) => m[0],
    )
    for (const tag of tags) expect(tag).toContain('crossorigin')
  })
})
