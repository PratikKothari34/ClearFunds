/*
 * INLINE SVG, NOT MATERIAL SYMBOLS FROM A CDN.
 *
 * The export loads the Material Symbols Outlined font from
 * fonts.googleapis.com and renders icons as ligature text. Three reasons
 * that is not carried over:
 *
 *   1. The production CSP allows no third-party origin.
 *   2. The icon font is ~200KB for the handful of glyphs used here, against
 *      a standing bundle budget.
 *   3. A ligature icon renders as the LITERAL WORD until the font loads.
 *      "Pending approval" beside an entry briefly reading "schedule" is
 *      worse than nothing on the one screen where precision matters.
 *
 * Each path below is drawn to the same 24-unit grid and 2-unit stroke, so
 * they sit together as one set rather than a collection.
 */

const PATHS = {
  ledger:
    'M4 4.5A1.5 1.5 0 0 1 5.5 3H17l3 3v14.5A1.5 1.5 0 0 1 18.5 22h-13A1.5 1.5 0 0 1 4 20.5zM8 8h6M8 12h8M8 16h8',
  approvals: 'M4 12.5 9 17.5 20 6.5',
  matrix:
    'M3.5 3.5h17v17h-17zM3.5 9h17M3.5 15h17M9 3.5v17M15 3.5v17',
  audit:
    'M6 3.5h12v17H6zM9 8h6M9 12h6M9 16h3',
  committee:
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 20.5a6.5 6.5 0 0 1 13 0M16.5 11.5a2.5 2.5 0 1 0 0-5M17 14.5a5 5 0 0 1 4.5 5',
  chain:
    'M9.5 14.5 7 17a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M14.5 9.5 17 7a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0M9 15l6-6',
  /* The brand mark: a shield, matching the export's header glyph. */
  shield: 'M12 2.5 20 6v6c0 5-3.4 8.4-8 9.5-4.6-1.1-8-4.5-8-9.5V6z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 21 21',
  download: 'M12 3.5v12M7.5 11 12 15.5 16.5 11M4 20.5h16',
  filter: 'M3.5 5.5h17l-6.5 7.5v6l-4 2v-8z',
  bank: 'M3 9.5 12 4l9 5.5M5 9.5v9M10 9.5v9M14 9.5v9M19 9.5v9M3 20.5h18',
  /*
   * A raised flag, for a question a resident has asked. Deliberately NOT
   * a warning triangle or an exclamation mark: a flag has no financial
   * effect by `0004`, and an alarm glyph would tell a resident they had
   * escalated something when they have only asked.
   */
  flag: 'M6 21V3.5h11l-2.5 4.5L17 12.5H6',
  /* A clock, for a period still open rather than one signed off. */
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3.5 2.5',
} as const

export type IconName = keyof typeof PATHS

export interface IconProps {
  name: IconName
  className?: string
  /*
   * An icon is decorative by default: `aria-hidden`, because it sits beside
   * a text label that already carries the meaning. Pass a title ONLY when
   * the icon is the sole thing conveying it - and then it becomes an img
   * with an accessible name rather than silent decoration.
   */
  title?: string
}

export function Icon({ name, className, title }: IconProps) {
  const decorative = title === undefined

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...(decorative
        ? { 'aria-hidden': true as const, focusable: false as const }
        : { role: 'img' as const })}
    >
      {!decorative && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  )
}
