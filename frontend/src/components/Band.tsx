import type { ReactNode } from 'react'

/**
 * A dashboard band: one ruled entry in the register.
 *
 * THE BAND IS A FIELD ON A GROUND, not a section on paper. It was a
 * `<section>` with padding and a bottom hairline, which meant the whole
 * product was text on one surface separated by lines, with a font size
 * as its only hierarchy. That reads as unstyled rather than as
 * restrained. The band now carries `cf-field`, so there is an inside
 * and an outside, and the hierarchy comes from the surface rather than
 * from scale alone.
 *
 * Deliberately not a card, and the distinction is load-bearing: no
 * radius, no shadow, and NO GAP BETWEEN SIBLINGS. Consecutive bands
 * share one continuous field divided by rules, the way a register's
 * lines are continuous. A card around a figure implies the figure is a
 * separate object with its own lifecycle, and a balance is not that -
 * it is the current state of one ledger.
 *
 * ONE RULE PER BOUNDARY, AND THE HEADING NO LONGER CARRIES ONE
 * (2026-10-25). The heading used to sit ON a rule, with the section
 * carrying a second one below it. Each was argued for on its own and
 * the pair was never looked at: five stacked bands put TEN hairlines
 * down a phone screen at even spacing, which is what "it looks
 * chopped" describes. The page was sliced into equal strips, and a
 * rule under every heading regardless of content says nothing - it is
 * texture, not information. The section border is the boundary; the
 * heading now earns its place from size, weight, colour and position.
 *
 * THE HEADING IS A CAPTION, NOT A TITLE. It was `font-headline-md text-headline-md` at
 * semibold, which competed with the balance figure - the one number
 * most of this product's audience opens the app to read. A reference
 * band's heading is there to be found when looked for, not to be
 * read first, so it is meta-sized, medium weight and quiet. The
 * figure is then the only large thing on the screen and the eye lands
 * on it without instruction.
 *
 * `tone` MAKES THE SPACING UNEVEN ON PURPOSE. Equal padding on every
 * band is the other half of the chopped look. `primary` is for the one
 * band that is the subject of its screen; `quiet` is everything else
 * and is the default, so an untouched caller gets the calmer
 * treatment rather than the loud one.
 *
 * One family throughout. Source Serif 4 used to set these headings -
 * one face for 18 headings, 19.6 KB, and on a cream ground the most
 * recognisable signature of a generated page.
 */

export function Band({
  heading,
  headingId,
  tone = 'quiet',
  children,
}: {
  /** Omitted on the balance band, which needs no label above the figure. */
  readonly heading?: string
  readonly headingId?: string
  /**
   * `primary` for the subject of the screen - more air above and
   * below, so it reads as the thing the page is about. `quiet` for
   * reference material.
   */
  readonly tone?: 'primary' | 'quiet'
  readonly children: ReactNode
}) {
  return (
    <section
      // Labelled by its own heading so a screen reader user can jump
      // between bands. A section with no accessible name is skipped by
      // the rotor entirely.
      aria-labelledby={heading ? headingId : undefined}
      className={
        'cf-field px-gutter border-b border-outline-variant last:border-b-0 ' +
        (tone === 'primary'
          ? 'pt-space-xl pb-space-xl'
          : 'pt-space-lg pb-space-lg')
      }
    >
      {heading && (
        /*
         * No rule, and `mb-space-md` rather than the old
         * `mb-space-lg` on top of a border: the caption sits close to
         * the content it labels, because a label far from its content
         * reads as a heading for the whole page.
         *
         * NOT tracked-out all-caps. An ALL-CAPS eyebrow above every
         * heading is template chrome that appears whatever the subject,
         * and it costs legibility on the device this is read on. Case
         * is left alone; the quiet colour does the demoting.
         */
        <h2
          id={headingId}
          className="font-label-code-sm text-label-code-sm font-medium text-on-surface-variant m-0 mb-space-md"
        >
          {heading}
        </h2>
      )}
      {children}
    </section>
  )
}
