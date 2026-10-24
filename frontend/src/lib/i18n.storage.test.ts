import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SUPPORTED_LOCALES,
  hasCatalogue,
  preferredLocale,
  setLocale,
} from './i18n'

/*
 * The stored-locale key, which is a hard constraint and had no guard.
 *
 * Renaming 'cf-locale' silently resets every resident to English. There
 * is no error and nothing fails: the old value sits in their browser
 * forever while the app reads a key nobody ever wrote, so the first
 * symptom is a Marathi reader quietly getting English months later.
 *
 * Unlike the theme key, this string is written in ONE file, so there is
 * no second copy to drift out of agreement — which is exactly why the
 * only thing that can catch a rename is a test naming the literal. The
 * assertion below is deliberately on the string itself and not on
 * `STORAGE_KEY`, which is private: reading the constant through the
 * module would rename along with it and pass.
 *
 * Paired with a round trip through the public API, because pinning the
 * literal alone would still pass if the read path stopped consulting
 * storage at all.
 */

const I18N_TS = readFileSync(resolvePath('src/lib/i18n.ts'), 'utf8')

describe('the stored locale key', () => {
  it('is still the string residents already have in their browsers', () => {
    // Not imported: STORAGE_KEY is private, and asserting on the
    // constant would follow a rename and pass. The point of this test
    // is that the PERSISTED name cannot change.
    const declared = /const STORAGE_KEY = '([^']+)'/.exec(I18N_TS)?.[1]
    expect(
      declared,
      'i18n.ts no longer declares STORAGE_KEY the expected way, so this guard has stopped reading anything',
    ).toBe('cf-locale')
  })

  it('is the only storage key this module touches', () => {
    /*
     * A second key would be a second migration nobody did. Every
     * localStorage call must go through the one constant rather than
     * repeating a literal, which is how the two halves of the theme key
     * came to exist in the first place.
     */
    const calls = [
      ...I18N_TS.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*([^),]+)/g),
    ].map((m) => m[1]?.trim())
    expect(calls.length).toBeGreaterThan(0)
    for (const arg of calls) {
      expect(arg, 'a localStorage call bypasses STORAGE_KEY').toBe(
        'STORAGE_KEY',
      )
    }
  })
})

describe('preferredLocale', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('reads back a choice stored under that key', () => {
    // The round trip, written against the key as a resident's browser
    // holds it rather than against the constant.
    localStorage.setItem('cf-locale', 'mr')
    expect(preferredLocale()).toBe('mr')
  })

  it('ignores a stored value that is not a locale we have', () => {
    /*
     * A previous version, or a hand-edited value, can leave anything
     * here. Passing it through sets a language with no catalogue: every
     * string renders through the English fallback while the page claims
     * to be in another language, and the font never loads.
     */
    for (const junk of ['', 'xx', 'en-GB-oed', 'null', '{}', 'MR']) {
      localStorage.setItem('cf-locale', junk)
      expect(
        preferredLocale(),
        `a stored value of ${JSON.stringify(junk)} was accepted`,
      ).not.toBe(junk)
    }
  })

  it('falls back rather than throwing when storage is unavailable', () => {
    /*
     * Private mode and blocked site data throw on ACCESS rather than
     * returning null, so an unguarded read fails the whole boot. A
     * locale is a preference; it is never worth refusing to start over.
     */
    const original = Object.getOwnPropertyDescriptor(
      window,
      'localStorage',
    ) as PropertyDescriptor
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    try {
      expect(() => preferredLocale()).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', original)
    }
  })
})

/*
 * The `lang` attribute must describe the TEXT, not the preference.
 *
 * Asserted by OUTCOME rather than by reading the source: the rule is
 * about what a screen reader is told, and a source check would be
 * satisfied by any expression that happens to mention `hasCatalogue`.
 * `applyLang` is private, so the only honest way in is the public
 * `setLocale` - which is also the only path a resident takes.
 *
 * Both halves are needed. Asserting only that `hi` yields `en` would
 * pass for a module that hardcoded `lang = 'en'` and never changed it
 * again, which is the opposite failure: a translated page announcing
 * the wrong language forever.
 */
describe('the document language follows the text, not the choice', () => {
  afterEach(() => {
    document.documentElement.lang = ''
  })

  it('stays English while a locale has no strings', async () => {
    for (const locale of SUPPORTED_LOCALES) {
      if (hasCatalogue(locale)) continue
      await setLocale(locale)
      expect(
        document.documentElement.lang,
        `lang announced ${locale} for a locale with no translated text, so a screen reader will read English words with ${locale} phonemes`,
      ).toBe('en')
    }
  })

  it('announces the locale once that locale has strings', async () => {
    /*
     * The control, and the half that stops the fix from becoming
     * `lang = 'en'` forever. Faked by handing `hasCatalogue`'s own
     * contract a locale that does have text: `en` is the one locale
     * whose strings are the source strings, so if any catalogue is ever
     * populated this assertion is what keeps the attribute moving.
     */
    const populated = SUPPORTED_LOCALES.filter((l) => hasCatalogue(l))
    if (populated.length === 0) {
      /*
       * Every catalogue is empty today. Rather than skip - which would
       * leave the rule half-guarded until someone noticed - assert that
       * the code path EXISTS by checking the attribute is written from
       * the locale and not pinned: `applyLang` must consult
       * `hasCatalogue`, so removing the consultation and hardcoding
       * 'en' is caught here.
       */
      const src = I18N_TS.replace(/\/\*[\s\S]*?\*\//g, '').replace(
        /\/\/[^\n]*/g,
        '',
      )
      const assignment = /document\.documentElement\.lang\s*=\s*([^\n]+)/.exec(
        src,
      )?.[1]
      expect(
        assignment,
        'nothing assigns document.documentElement.lang any more',
      ).toBeTruthy()
      expect(
        assignment,
        'lang is pinned to a constant, so a translated page would announce the wrong language forever',
      ).toMatch(/\blocale\b/)
      return
    }
    for (const locale of populated) {
      await setLocale(locale)
      expect(
        document.documentElement.lang,
        `${locale} has translated text but lang does not say so`,
      ).toBe(locale)
    }
  })
})
