import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SUPPORTED_LOCALES,
  isDevanagari,
  isSupported,
  normalizeLocale,
} from './i18n'

/*
 * Two different failures are guarded here.
 *
 * The first is a locale that is not a catalogue key reaching i18next:
 * every string then renders through the fallback while the page claims
 * to be in another language, which is worse than being honestly in
 * English.
 *
 * The second is the 104 KB Devanagari font becoming unconditional. The
 * CSS side of that is covered in styles/fonts.test.ts; what is checked
 * here is the TypeScript side, where the regression is a one-word edit
 * turning the dynamic import static.
 */

const SOURCE = readFileSync(resolve('src/lib/i18n.ts'), 'utf8')

describe('normalizeLocale', () => {
  it('passes through the locales that have catalogues', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(normalizeLocale(locale), locale).toBe(locale)
    }
  })

  it('reduces a regional tag to its base language', () => {
    // What a real device actually reports. Without this, a Marathi
    // phone gets English.
    expect(normalizeLocale('mr-IN')).toBe('mr')
    expect(normalizeLocale('hi-IN')).toBe('hi')
    expect(normalizeLocale('en-GB')).toBe('en')
    expect(normalizeLocale('EN-US')).toBe('en')
  })

  it('falls back to English for a language with no catalogue', () => {
    // Not an error: a Tamil-speaking society is served English until
    // someone supplies a Tamil catalogue. Claiming `ta` would render
    // English under a Tamil lang attribute, which misdirects a screen
    // reader's voice.
    expect(normalizeLocale('ta')).toBe('en')
    expect(normalizeLocale('ta-IN')).toBe('en')
    expect(normalizeLocale('zz')).toBe('en')
  })

  it('survives anything that is not a language tag', () => {
    // localStorage can hold whatever an older version wrote, including
    // nothing.
    for (const value of [undefined, null, '', '-', 42, {}, [], true]) {
      expect(normalizeLocale(value), String(value)).toBe('en')
    }
  })
})

describe('isSupported', () => {
  it('accepts exactly the declared locales and nothing else', () => {
    for (const locale of SUPPORTED_LOCALES) expect(isSupported(locale)).toBe(true)
    // A regional tag is deliberately NOT supported: it is normalized
    // first. Accepting it here would set a language with no resources.
    for (const value of ['mr-IN', 'en-GB', 'ta', '', null, undefined]) {
      expect(isSupported(value), String(value)).toBe(false)
    }
  })
})

describe('isDevanagari', () => {
  it('names the scripts, not the countries', () => {
    expect(isDevanagari('mr')).toBe(true)
    expect(isDevanagari('hi')).toBe(true)
    // English is the default and must never pull the extra font.
    expect(isDevanagari('en')).toBe(false)
  })

  it('does not claim Devanagari for an unknown locale', () => {
    // Guessing here would download 104 KB for a locale that cannot
    // render anyway.
    for (const value of ['ta', 'en-IN', '', 'devanagari']) {
      expect(isDevanagari(value), value).toBe(false)
    }
  })
})

describe('the Devanagari font stays out of the default payload', () => {
  it('is reached only through a dynamic import', () => {
    // A static `import '../styles/fonts.devanagari.css'` puts the whole
    // face in the entry chunk, and nothing else in the project would
    // fail. This is the assertion that notices.
    expect(SOURCE).not.toMatch(/^\s*import\s+['"].*fonts\.devanagari/m)
    expect(SOURCE).toMatch(/await import\(\s*['"]\.\.\/styles\/fonts\.devanagari\.css['"]\s*\)/)
  })

  it('is guarded by a locale check at every call site', () => {
    // Every call to the loader must sit behind isDevanagari. A bare
    // call added "to keep the switch instant" would defeat the gate.
    const calls = [...SOURCE.matchAll(/loadDevanagariFont\(/g)]
    // One definition, plus the guarded calls.
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const match of SOURCE.matchAll(
      /([^\n]*\n[^\n]*)loadDevanagariFont\(\)/g,
    )) {
      const context = match[1] ?? ''
      // Skip the declaration itself.
      if (context.includes('export async function')) continue
      expect(context, 'unguarded loadDevanagariFont call').toMatch(
        /isDevanagari/,
      )
    }
  })

  it('loads the face at most once', () => {
    // Switching back and forth must not re-request it. The flag is set
    // before the await on purpose, so two near-simultaneous switches
    // cannot both get past it.
    expect(SOURCE).toMatch(/devanagariLoaded\s*=\s*true[\s\S]{0,80}await import/)
  })
})

describe('document language', () => {
  it('is written on both the boot path and the switch', () => {
    // `lang` picks hyphenation and line-breaking and tells a screen
    // reader which voice to use. A Marathi page announced in an English
    // voice is unintelligible, so neither path may skip it.
    expect(SOURCE).toMatch(/documentElement\.lang\s*=/)
    const calls = [...SOURCE.matchAll(/applyLang\(/g)]
    // The definition, plus a call from initI18n and one from setLocale.
    expect(calls.length).toBeGreaterThanOrEqual(3)
  })
})

describe('the translation library stays out of the default payload', () => {
  it('is reached only through a dynamic import', () => {
    // i18next and react-i18next are ~50 KB raw. English copy is the
    // source string in the JSX, so the default locale renders correctly
    // with the library absent. A top-level import would put all of it
    // back in the entry chunk and no test but this one would notice.
    expect(SOURCE).not.toMatch(/^\s*import\s+.*from\s+['"]i18next['"]/m)
    expect(SOURCE).not.toMatch(/^\s*import\s+.*from\s+['"]react-i18next['"]/m)
    expect(SOURCE).toMatch(/import\(\s*['"]i18next['"]\s*\)/)
    expect(SOURCE).toMatch(/import\(\s*['"]react-i18next['"]\s*\)/)
  })

  it('does not start the runtime when booting into English', () => {
    // The whole saving. initI18n must return before startRuntime on the
    // default locale.
    const body = SOURCE.slice(SOURCE.indexOf('export async function initI18n'))
    const guard = body.indexOf("initial === 'en'")
    const start = body.indexOf('startRuntime')
    expect(guard, 'initI18n must short-circuit on English').toBeGreaterThan(-1)
    expect(start, 'the English guard must precede startRuntime').toBeGreaterThan(
      guard,
    )
  })

  it('initializes the runtime at most once', () => {
    // A promise, not a boolean: two switches in quick succession must
    // await the same init rather than racing two of them.
    expect(SOURCE).toMatch(/runtime\s*\?\?=/)
  })
})
