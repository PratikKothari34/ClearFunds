import { describe, expect, it, vi, afterEach } from 'vitest'
import { resolveLocale, storeLocale, SUPPORTED_LOCALES } from './i18n'

/*
 * THE `'cf-locale'` GUARD, AND WHY IT ASSERTS THE ACCESS RATHER THAN THE
 * RETURN VALUE.
 *
 * With one supported locale, EVERY WRONG ANSWER IS ALSO `'en'`:
 *
 *   - empty storage returns 'en'
 *   - a throwing accessor returns 'en'
 *   - a stale 'mr' or 'hi' returns 'en'
 *   - and so does deleting the storage read entirely
 *
 * So NO assertion on the return value can prove the key is still being read.
 * A test written that way passes on code that never touches localStorage,
 * which is precisely the rename this guard exists to catch.
 *
 * The guard therefore asserts the ACCESS, spied on `Storage.prototype` -
 * where jsdom actually defines `getItem`. Spying on `window.localStorage`
 * installs a spy the real call never reaches, so it reports zero calls
 * against perfectly correct code and the guard is dead while looking alive.
 *
 * It names the LITERAL `'cf-locale'`, never the private `STORAGE_KEY`, which
 * would follow a rename and keep passing.
 */
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('the cf-locale storage key', () => {
  it('is still read, by that exact name', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem')
    resolveLocale()
    expect(
      get.mock.calls.map((c) => c[0]),
      'resolveLocale must read localStorage under the key "cf-locale". ' +
        'Renaming it resets every resident to English with no error, and the ' +
        'old value sits in their browser forever. Note that asserting the ' +
        'RETURN value cannot catch this: with one locale, every wrong answer ' +
        'is also "en".',
    ).toContain('cf-locale')
  })

  it('is written under that exact name', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem')
    storeLocale('en')
    expect(set.mock.calls.map((c) => c[0])).toContain('cf-locale')
  })
})

describe('resolving a locale', () => {
  it('ships exactly one locale', () => {
    /*
     * Not a style assertion. The guard above is shaped the way it is BECAUSE
     * there is one locale. If a second one is added, the return value becomes
     * informative and this suite should gain assertions on it - so this test
     * is the tripwire that says so.
     */
    expect(
      SUPPORTED_LOCALES.length,
      'a second locale was added - resolveLocale can now return something ' +
        'other than "en", so this suite should assert on the return value too',
    ).toBe(1)
  })

  it('resolves a stale locale from a shipped older version to honest English', () => {
    // Residents still hold these from the versions that shipped them.
    for (const stale of ['mr', 'hi']) {
      localStorage.setItem('cf-locale', stale)
      expect(
        (SUPPORTED_LOCALES as readonly string[]).includes(resolveLocale()),
        `a stored "${stale}" must resolve to a locale that has a catalogue`,
      ).toBe(true)
    }
  })

  it('never returns a locale without a catalogue', () => {
    for (const junk of ['', 'xx', 'en-US', 'null', 'undefined']) {
      localStorage.setItem('cf-locale', junk)
      expect(
        (SUPPORTED_LOCALES as readonly string[]).includes(resolveLocale()),
        `a stored "${junk}" produced a locale with no catalogue`,
      ).toBe(true)
    }
  })

  it('survives a throwing accessor, as in a private window', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied')
    })
    expect(() => resolveLocale()).not.toThrow()
    expect(
      (SUPPORTED_LOCALES as readonly string[]).includes(resolveLocale()),
    ).toBe(true)
  })

  it('survives a throwing write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => storeLocale('en')).not.toThrow()
  })
})
