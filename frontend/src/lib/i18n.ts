/**
 * Translation, wired at scaffold rather than retrofitted.
 *
 * Retrofitting i18n means walking every component and every string
 * once a committee asks for Marathi, and the strings that get missed
 * are the rare ones — error states, the mismatch warning, the
 * reversal copy. Those are the strings a resident most needs in their
 * own language.
 *
 * TWO PAYLOADS ARE GATED ON LOCALE HERE, AND BOTH GATES MATTER.
 *
 * The font: Noto Sans Devanagari is 104 KB, twice the whole Latin
 * payload. 'Noto Sans Devanagari' sits permanently in the font stack in
 * tokens.css; only the @font-face rules arrive on demand.
 *
 * The library: i18next and react-i18next are ~50 KB raw together, and
 * nothing in English needs them. English copy IS the source string in
 * the JSX, so on the default locale the correct text renders with the
 * library absent. It is therefore imported dynamically, inside the
 * branch that needs it, and an English-speaking society never downloads
 * it at all. This is the resident read path, which the design holds to
 * the tightest budget in the product.
 *
 * The consequence to keep in mind: a component may only reach
 * translation through a path that tolerates the library being absent.
 * There is no top-level `import i18next`, and adding one silently puts
 * all 50 KB back in the entry chunk — i18n.test.ts asserts against
 * exactly that.
 */

export const SUPPORTED_LOCALES = ['en', 'mr', 'hi'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** Locales written in Devanagari, which need the extra font payload. */
const DEVANAGARI_LOCALES: readonly Locale[] = ['mr', 'hi']

export function isDevanagari(locale: string): boolean {
  return DEVANAGARI_LOCALES.includes(locale as Locale)
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
 * can hold whatever a previous version wrote, and navigator.language is
 * a tag like `mr-IN` or `en-GB` that is not itself a key in the
 * catalogue. Passing either straight to i18next sets a language with no
 * resources, and every string then renders through the fallback while
 * the font never loads — a Marathi reader gets English in a page
 * labelled Marathi.
 */
export function normalizeLocale(value: unknown): Locale {
  if (isSupported(value)) return value
  if (typeof value === 'string') {
    // `mr-IN` and `hi-IN` are the common forms from a real device.
    const base = value.toLowerCase().split('-')[0]
    if (isSupported(base)) return base
  }
  return 'en'
}

/**
 * The locale to start in: the resident's saved choice, else the device's.
 *
 * The saved choice wins over the device on purpose. A shared family
 * phone may be set to English while the member reading the accounts is
 * not, and the whole point of the switch is that their choice sticks.
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
    // As above: the switch still works for this visit.
  }
}

/**
 * Pulls in the Devanagari @font-face rules, once.
 *
 * A dynamic import, so the 104 KB lands in its own chunk that an
 * English-speaking society never requests. Idempotent: switching back
 * and forth must not queue the download again.
 */
let devanagariLoaded = false
export async function loadDevanagariFont(): Promise<void> {
  if (devanagariLoaded) return
  devanagariLoaded = true
  await import('../styles/fonts.devanagari.css')
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
        en: { translation: {} },
        mr: { translation: {} },
        hi: { translation: {} },
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

/** Writes the document language. Separated so both paths agree. */
function applyLang(locale: Locale): void {
  if (typeof document !== 'undefined') {
    // `lang` is not cosmetic: it picks the hyphenation and line-breaking
    // rules, and it tells a screen reader which voice to use. A Marathi
    // page announced in an English voice is unintelligible.
    document.documentElement.lang = locale
  }
}

/**
 * Switches language: font, library, document and stored preference.
 *
 * Switching TO English does not need the library either — the source
 * strings are English — but by the time anyone switches back they have
 * already paid for it, so this takes the simple path and starts the
 * runtime for any explicit choice.
 */
export async function setLocale(locale: Locale): Promise<void> {
  if (isDevanagari(locale)) {
    await loadDevanagariFont()
  }
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
 * ON ENGLISH THIS DOES NO NETWORK WORK AND NO LIBRARY WORK. It sets the
 * document language and returns, so the default locale pays nothing for
 * translation being wired. The library and the font are started only
 * for a locale that actually needs them, and the boot await covers both
 * so the first paint is already in the right language and face.
 */
export async function initI18n(initial: Locale = 'en'): Promise<void> {
  applyLang(initial)

  if (initial === 'en') return

  if (isDevanagari(initial)) {
    await loadDevanagariFont()
  }
  await startRuntime(initial)
}
