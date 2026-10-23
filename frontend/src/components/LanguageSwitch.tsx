import { useState } from 'react'
import { SUPPORTED_LOCALES, preferredLocale, setLocale } from '../lib/i18n'
import type { Locale } from '../lib/i18n'

/**
 * The language control, in the header beside the theme toggle.
 *
 * A native <select>, not a custom dropdown. On Android this opens the
 * OS picker, which is large, scrollable with a thumb and already
 * translated; a div-based menu would reimplement all of that and lose
 * the keyboard model for nothing. It is also one element rather than a
 * popover, which keeps it off the critical path of the first paint.
 *
 * Each language is named IN ITS OWN SCRIPT. A resident who cannot read
 * English cannot find "Marathi" in a list, which is the exact person
 * the control exists for. Note this means the option labels render in
 * Devanagari before the Devanagari font has loaded, so they fall back
 * to the system face — correct and readable, just not our face, which
 * is the right trade against downloading 104 KB to label a menu.
 */
export function LanguageSwitch() {
  const [locale, setCurrent] = useState<Locale>(() => preferredLocale())
  const [pending, setPending] = useState(false)

  async function change(next: Locale) {
    if (next === locale) return
    setPending(true)
    try {
      // On a Devanagari locale this awaits the font chunk. The select
      // stays interactive and the label changes only once the switch
      // has actually happened, so a slow connection shows the old
      // language rather than an untranslated page in the new one.
      await setLocale(next)
      setCurrent(next)
    } finally {
      setPending(false)
    }
  }

  return (
    <label className="inline-flex items-center">
      {/*
        The visible text is the globe; the label text is for screen
        readers. "Language" rather than "Choose language": the select
        already announces that it is a chooser.
      */}
      <span className="cf-sr-only">Language</span>

      <span className="relative inline-flex h-11 items-center gap-1 rounded-md pl-2 pr-1 text-ink-quiet hover:text-ink">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3.2 9h17.6M3.2 15h17.6M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
        </svg>

        <select
          value={locale}
          disabled={pending}
          onChange={(event) => {
            void change(event.target.value as Locale)
          }}
          /*
           * Transparent background and inherited colour so the control
           * matches the header in both themes without a second set of
           * tokens. appearance-none drops the native arrow, which would
           * sit oddly next to the globe; the chevron below replaces it.
           */
          className="appearance-none bg-transparent text-ink-quiet hover:text-ink text-meta pr-4 py-0 border-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm"
        >
          {SUPPORTED_LOCALES.map((code) => (
            <option key={code} value={code} lang={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>

        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          // Sits over the select's right edge, which has pr-4 reserved
          // for it. pointer-events-none so a tap there still opens the
          // picker rather than hitting the decoration.
          className="pointer-events-none absolute right-1"
        >
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </span>
    </label>
  )
}

/**
 * Each language in its own script, which is the whole point.
 *
 * Declared here rather than in i18n.ts so the strings travel with the
 * control that renders them; i18n.ts stays free of anything visual.
 */
const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = {
  en: 'English',
  mr: 'मराठी',
  hi: 'हिंदी',
}
