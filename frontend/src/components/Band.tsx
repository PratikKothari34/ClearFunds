import type { ReactNode } from 'react'

/**
 * A dashboard band.
 *
 * Bands are separated by 32px and group internally at 16px, which is
 * what makes the grouping unambiguous without drawing rules between
 * sections. The spacing IS the sectionalization.
 *
 * Deliberately not a card. A card around a figure implies the figure is
 * a separate object with its own lifecycle, and a balance is not that —
 * it is the current state of one ledger.
 *
 * The heading is the only place Source Serif 4 appears: one signal that
 * a band is a band, with no rules and no tracked-out caps.
 */

export function Band({
  heading,
  headingId,
  children,
}: {
  /** Omitted on the balance band, which needs no label above the figure. */
  readonly heading?: string
  readonly headingId?: string
  readonly children: ReactNode
}) {
  return (
    <section
      // Labelled by its own heading so a screen reader user can jump
      // between bands. A section with no accessible name is skipped by
      // the rotor entirely.
      aria-labelledby={heading ? headingId : undefined}
      className="py-(--cf-s4) border-b border-rule last:border-b-0"
    >
      {heading && (
        <h2
          id={headingId}
          className="font-serif text-head font-normal mb-(--cf-s2)"
        >
          {heading}
        </h2>
      )}
      {children}
    </section>
  )
}
