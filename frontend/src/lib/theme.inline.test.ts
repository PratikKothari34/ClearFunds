import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * The theme is applied twice by two separate pieces of code: the inline
 * script in index.html (before first paint) and theme.ts (at runtime).
 * They share a storage key and an attribute name but no code, so nothing
 * but a test keeps them agreeing.
 *
 * The design calls the before-paint script "the single implementation
 * detail most likely to be skipped and most likely to be noticed". These
 * tests assert it is present and correct in the HTML itself.
 */

const HTML = readFileSync(resolvePath('index.html'), 'utf8')
const THEME_TS = readFileSync(resolvePath('src/lib/theme.ts'), 'utf8')

function headInlineScripts(html: string): string[] {
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? ''
  return [
    ...head.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((m) => m[1] ?? '')
}

describe('the theme-before-paint script', () => {
  const scripts = headInlineScripts(HTML)

  it('exists in <head>', () => {
    // In <head> and inline: moved to a module or to the end of <body> it
    // runs after first paint and a dark-mode resident gets a white flash.
    expect(scripts.length).toBeGreaterThan(0)
  })

  it('is the only inline script, so one CSP hash covers the app', () => {
    expect(scripts).toHaveLength(1)
  })

  const script = scripts[0] ?? ''

  it('uses the same storage key as theme.ts', () => {
    const key = /const KEY = '([^']+)'/.exec(THEME_TS)?.[1]
    expect(key, 'theme.ts no longer declares KEY the expected way').toBe(
      'cf-theme',
    )
    expect(script).toContain(`'${key}'`)
  })

  it('sets the same attribute the stylesheet selects on', () => {
    expect(script).toContain('data-theme')
    const css = readFileSync(resolvePath('src/styles/tokens.css'), 'utf8')
    expect(css).toContain("[data-theme='dark']")
    expect(css).toContain("[data-theme='light']")
  })

  it('accepts only the two explicit values', () => {
    // It must not write an arbitrary stored string onto the attribute: a
    // junk value would leave the page in neither theme.
    expect(script).toContain("'light'")
    expect(script).toContain("'dark'")
  })

  it('is wrapped in try/catch, because reading storage can throw', () => {
    expect(script).toMatch(/try\s*\{/)
    expect(script).toMatch(/catch/)
  })

  it('is not async or deferred, which would defeat its purpose', () => {
    const tag = /<script(?![^>]*\bsrc=)([^>]*)>/i.exec(HTML)?.[1] ?? ''
    expect(tag).not.toMatch(/\basync\b/)
    expect(tag).not.toMatch(/\bdefer\b/)
    expect(tag).not.toMatch(/type=["']module["']/)
  })
})

describe('index.html', () => {
  it('declares a viewport, so the layout works on a phone', () => {
    expect(HTML).toMatch(/name="viewport"/)
  })

  it('does not reference a remote origin for fonts, scripts or styles', () => {
    // Fonts are self-hosted and no third-party request is made from an
    // authenticated screen: a referrer leak would tell another origin
    // which society a resident belongs to.
    const remote = [...HTML.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/gi)]
    expect(remote.map((m) => m[0])).toEqual([])
  })
})
