/**
 * Translation, wired but ENGLISH-ONLY.
 *
 * THE PRODUCT SHIPS ONE LOCALE. `SUPPORTED_LOCALES` is `['en']`, and
 * that is the decision, not a to-do: there is no language control, no
 * second catalogue and no Devanagari font. Hindi and Marathi were both
 * removed deliberately.
 *
 * The scaffolding stays because the thing it prevents is expensive and
 * the thing it costs is nothing. Retrofitting i18n means walking every
 * component and every string once a committee does ask for Marathi, and
 * the strings that get missed are the rare ones - error states, the
 * mismatch warning, the reversal copy. Those are exactly the strings a
 * resident most needs in their own language. Adding a locale back is
 * one entry in `SUPPORTED_LOCALES` plus a catalogue.
 *
 * AND IT COSTS THE SHIPPED LOCALE NOTHING. i18next and react-i18next
 * build to a 67 KB raw chunk together (23 KB gzip; `npm run budget`
 * prints the current figure), and nothing in English needs them:
 * English copy IS the source string in the JSX, so the correct text
 * renders with the library absent. It is imported dynamically, inside
 * the branch that needs it, so today - one locale, English - it is
 * never downloaded at all. This is the resident read path, which the
 * design holds to the tightest budget in the product.
 *
 * The consequence to keep in mind: a component may only reach
 * translation through a path that tolerates the library being absent.
 * There is no top-level `import i18next`, and adding one silently puts
 * the whole chunk back in the entry - i18n.test.ts asserts against
 * exactly that. The size is deliberately not restated here: a number
 * written twice drifts in one place.
 */

export const SUPPORTED_LOCALES = ['en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/**
 * The translation catalogues, one per supported locale - so, one.
 *
 * EMPTY, and that is a stated fact rather than an oversight: the whole
 * UI is hardcoded English and nothing calls `t()`. The object exists
 * because `applyLang` has to be able to ask whether a locale has any
 * text - the `lang` attribute must follow what is on screen, not what
 * was requested. Keeping the catalogues inline inside `init` meant
 * there was nothing to ask.
 *
 * Keys are English sentences (`keySeparator: false`), so adding a
 * locale's first string is all that is needed; nothing else has to be
 * updated for the attribute to become correct.
 */
const CATALOGUES: Record<Locale, Readonly<Record<string, string>>> = {
  en: {},
}

/** The stored choice, if a resident has made one. */
const STORAGE_KEY = 'cf-locale'

export function isSupported(value: unknown): value is Locale {
  return (
    typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale)
  )
}

/**
 * Narrows anything to a supported locale, or English.
 *
 * Both sources of a locale are untrusted in the same way: localStorage
 * can hold whatever a previous version wrote - INCLUDING `mr` or `hi`,
 * which this app used to support and real browsers are still holding -
 * and navigator.language is a tag like `en-GB` that is not itself a key
 * in the catalogue. Passing either straight to i18next sets a language
 * with no resources, and every string then renders through the fallback
 * while the page claims to be in another language.
 */
export function normalizeLocale(value: unknown): Locale {
  if (isSupported(value)) return value
  if (typeof value === 'string') {
    // `en-GB` and `en-IN` are the common forms from a real device.
    const base = value.toLowerCase().split('-')[0]
    if (isSupported(base)) return base
  }
  return 'en'
}

/**
 * The locale to start in: the resident's saved choice, else the device's.
 *
 * The saved choice wins over the device on purpose, and the rule
 * outlives the control that used to set it: the key is still read, so a
 * stored value from an older version is honoured if it is still a
 * locale we have, and discarded if it is not.
 */
export function preferredLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (isSupported(saved)) return saved
  } catch {
    // Private mode and blocked site data both throw on access rather
    // than returning null. A locale is a preference, not state worth
    // failing a boot over.
  }
  return normalizeLocale(window.navigator?.language)
}

function remember(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // As above: the locale still applies for this visit.
  }
}

/**
 * Starts i18next, once, and returns it.
 *
 * Dynamically imported so the library is absent from the entry chunk.
 * The guard is a promise rather than a boolean: two locale switches in
 * quick succession must await the same init, not start a second one.
 */
let runtime: Promise<typeof import('i18next').default> | undefined

function startRuntime(initial: Locale) {
  runtime ??= (async () => {
    const [{ default: i18next }, { initReactI18next }] = await Promise.all([
      import('i18next'),
      import('react-i18next'),
    ])

    await i18next.use(initReactI18next).init({
      lng: initial,
      fallbackLng: 'en',
      supportedLngs: SUPPORTED_LOCALES,
      // Keys are English sentences, so a missing translation renders
      // readable English instead of a dotted key. A resident seeing
      // `ledger.reversed.label` is worse served than one seeing English.
      keySeparator: false,
      nsSeparator: false,
      resources: {
        en: { translation: CATALOGUES.en },
      },
      interpolation: {
        // React escapes already; escaping twice mangles an apostrophe in
        // a payee name.
        escapeValue: false,
      },
    })

    return i18next
  })()

  return runtime
}

/**
 * Whether a locale has any translated text to announce.
 *
 * Derived from the catalogues rather than written down, so shipping a
 * locale's first strings is what switches it on - not a flag someone
 * has to remember to flip in a second place.
 */
export function hasCatalogue(locale: Locale): boolean {
  return Object.keys(CATALOGUES[locale] ?? {}).length > 0
}

/**
 * Writes the document language. Separated so both paths agree.
 *
 * `lang` DESCRIBES THE TEXT, NOT THE REQUEST, and setting it from the
 * requested locale was a lie in exactly the direction that hurts the
 * people translation is for. The catalogue is empty and nothing calls
 * `t()`, so a request for a locale with no strings left the page in
 * English while announcing that locale - and a screen reader then reads
 * English words with the wrong phonemes, which is less intelligible
 * than the English voice it replaced. The sighted reader gets English
 * either way; the blind one got English made unreadable.
 *
 * So the attribute follows the TEXT: it stays `en` until that locale
 * actually has strings. The moment a catalogue lands the attribute
 * becomes correct on its own.
 */
function applyLang(locale: Locale): void {
  if (typeof document !== 'undefined') {
    // It picks hyphenation and line-breaking rules and tells a screen
    // reader which voice to use, so it has to match what is on screen.
    document.documentElement.lang = hasCatalogue(locale) ? locale : 'en'
  }
}

/**
 * Switches locale: library, document and stored preference.
 *
 * English does not need the library at all - the source strings are
 * English - but this takes the simple path and starts the runtime for
 * any explicit call, because the only caller that will ever exist is
 * one setting a locale that does need it.
 */
export async function setLocale(locale: Locale): Promise<void> {
  const i18next = await startRuntime(locale)
  await i18next.changeLanguage(locale)
  applyLang(locale)
  if (typeof window !== 'undefined') {
    remember(locale)
  }
}

/**
 * Called once at boot, before the first render.
 *
 * ON ENGLISH THIS DOES NO NETWORK WORK AND NO LIBRARY WORK. It sets
 * the document language and returns, so the only locale the product
 * ships pays nothing for translation being wired. The library is
 * started only for a locale that needs it, and the boot await covers
 * it, so the first paint is already in the right language.
 */
export async function initI18n(initial: Locale = 'en'): Promise<void> {
  applyLang(initial)

  if (initial === 'en') return

  await startRuntime(initial)
}
