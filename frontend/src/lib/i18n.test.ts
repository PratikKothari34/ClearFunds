import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SUPPORTED_LOCALES, isSupported, normalizeLocale } from './i18n'

/*
 * Two different failures are guarded here.
 *
 * The first is a locale that is not a catalogue key reaching i18next:
 * every string then renders through the fallback while the page claims
 * to be in another language, which is worse than being honestly in
 * English. THIS IS NOT DEAD NOW THAT ONLY `en` SHIPS - it is live for
 * the opposite reason. Residents' browsers still hold `cf-locale` set
 * to `mr` or `hi` from the versions that supported them, and
 * navigator.language still reports whatever the device is set to, so
 * the narrowing path takes real non-`en` input every day.
 *
 * The second is the translation library becoming unconditional. The
 * regression is a one-word edit turning the dynamic import static,
 * which puts the whole chunk in the entry and charges the resident read
 * path for a locale the product does not ship.
 */

const SOURCE = readFileSync(resolve('src/lib/i18n.ts'), 'utf8')

describe('normalizeLocale', () => {
  it('passes through the locales that have catalogues', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(normalizeLocale(locale), locale).toBe(locale)
    }
  })

  it('reduces a regional tag to its base language', () => {
    // What a real device actually reports.
    expect(normalizeLocale('en-GB')).toBe('en')
    expect(normalizeLocale('EN-US')).toBe('en')
    expect(normalizeLocale('en-IN')).toBe('en')
  })

  it('falls back to English for a language with no catalogue', () => {
    /*
     * Not an error: a society is served English until someone supplies
     * a catalogue. Claiming the locale would render English under
     * another lang attribute, which misdirects a screen reader's voice.
     *
     * `mr` and `hi` ARE THE IMPORTANT CASES, not historical ones. The
     * app shipped with both, so residents' browsers hold them under
     * `cf-locale` right now; this is the assertion that those stored
     * values resolve to honest English instead of a language with no
     * resources.
     */
    for (const gone of ['mr', 'hi', 'mr-IN', 'hi-IN']) {
      expect(normalizeLocale(gone), gone).toBe('en')
    }
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
    // `mr` and `hi` are listed because they used to pass.
    for (const value of ['mr', 'hi', 'en-GB', 'ta', '', null, undefined]) {
      expect(isSupported(value), String(value)).toBe(false)
    }
  })
})

describe('no second script family is reachable from here', () => {
  it('imports no font stylesheet at all, statically or dynamically', () => {
    /*
     * This module used to import `fonts.devanagari.css` inside a locale
     * branch. Both the file and the locales are gone, so the assertion
     * inverts: the i18n layer must not pull ANY font CSS. A static
     * import would put a face in the entry chunk and nothing else in
     * the project would fail; a dynamic one would reintroduce a
     * stylesheet that no longer exists.
     */
    expect(SOURCE).not.toMatch(/import\s*\(?\s*['"][^'"]*fonts\./)
    /*
     * THE IMPORT, NOT THE WORD - the same correction fonts.test.ts
     * already carries twice. The header comment in i18n.ts explains at
     * length that Devanagari and its locales were removed and must not
     * return, so a test forbidding the string went red on the very
     * explanation that makes the rule findable. Punishing the comment
     * teaches the next person to delete the comment.
     */
    expect(SOURCE).not.toMatch(/import\s*\(?\s*['"][^'"]*devanagari/i)
  })

  it('declares exactly the locales the product ships', () => {
    /*
     * Pinned to ENGLISH-ONLY by count and by content. Adding a locale
     * is a product decision with a font, a catalogue and a control
     * behind it, so it must not happen as a one-word edit here - and
     * re-adding `mr` or `hi` without their font is the specific
     * regression this catches.
     */
    expect([...SUPPORTED_LOCALES]).toEqual(['en'])
  })
})

describe('document language', () => {
  it('is written on both the boot path and the switch', () => {
    // `lang` picks hyphenation and line-breaking and tells a screen
    // reader which voice to use. A page announced in the wrong language
    // is read with the wrong phonemes, so neither path may skip it.
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
