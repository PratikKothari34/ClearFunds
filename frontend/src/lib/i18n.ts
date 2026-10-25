import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en.json'

/*
 * ENGLISH ONLY. `SUPPORTED_LOCALES` is `['en']`.
 *
 * Hindi and Marathi shipped once and were removed, along with the language
 * switch, the Devanagari font CSS and both Noto woff2 files.
 *
 * THE SCAFFOLDING STAYS ANYWAY. It is lazily imported, so one locale costs
 * almost nothing, and the original reason for wiring it early is unchanged: a
 * retrofit misses the RARE strings - error states, the record-mismatch
 * warning, the reversal copy - and those are exactly the ones a resident most
 * needs in their own language. Adding a locale back is one entry here plus a
 * catalogue.
 */
export const SUPPORTED_LOCALES = ['en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/*
 * HARD CONSTRAINT: this string must never be renamed.
 *
 * A rename silently resets every resident to English with no error, and the
 * old value sits in their browser forever. Unlike `'cf-theme'` this literal
 * is written in only ONE file, so there is no second copy to drift - which
 * also means nothing but a test naming the literal can catch a rename.
 *
 * Guarded by `i18n.storage.test.ts`. That guard asserts the ACCESS, not the
 * return value, and it must: see the note there.
 */
const STORAGE_KEY = 'cf-locale'

function isSupported(value: unknown): value is Locale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  )
}

/*
 * Resolves the locale to use.
 *
 * Residents' browsers still hold `mr` and `hi` from the versions that shipped
 * them, so this takes real non-`en` input and must resolve it to honest
 * English rather than to a language with no catalogue.
 */
export function resolveLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isSupported(stored)) return stored
  } catch {
    // A throwing accessor, as in a private window. Fall through.
  }
  return 'en'
}

export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // A resident who cannot persist a choice still gets a working page.
  }
}

export function initI18n(): typeof i18next {
  void i18next.use(initReactI18next).init({
    lng: resolveLocale(),
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LOCALES,
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
    // Errors belong in the console in dev, not in the UI, and nowhere in prod.
    debug: false,
  })
  return i18next
}

export default i18next
