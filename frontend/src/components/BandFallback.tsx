import { Band } from './Band'

/**
 * What a band renders when its own fetch failed.
 *
 * THE RULE THIS EXISTS TO ENFORCE: a failed band renders a retry, never
 * an empty slot. The bands fetch independently, so one can fail while
 * the rest of the page succeeds — and in this design an empty slot
 * carries meaning. An empty attention band means "nothing needs you". A
 * missing balance would read as a society with no money. A silent
 * fingerprint band would read as a pass. None of those is what a failed
 * request means.
 *
 * It is one component rather than a block copied into every surface
 * that can fail - four dashboard bands and a dozen routes
 * because the copies would drift, and the one that drifts is the one
 * that renders nothing.
 *
 * Deliberately NOT amber. Amber means this viewer must act; a failed
 * fetch is the product's problem, not the resident's, and colouring it
 * amber would make a network blip look like a pending approval.
 */

export function BandFallback({
  heading,
  headingId,
  explanation,
  onRetry,
}: {
  /** What could not be loaded, said as a fact rather than an error code. */
  readonly heading: string
  readonly headingId: string
  /**
   * One sentence naming what is missing and what is still true. A
   * resident who cannot see the balance needs to know the rest of the
   * page is not also stale.
   */
  readonly explanation: string
  /**
   * `| undefined` explicitly, not just optional: under
   * exactOptionalPropertyTypes a band forwarding its own optional
   * `onRetry` straight through cannot assign to a plain `?:`.
   */
  readonly onRetry?: (() => void) | undefined
}) {
  return (
    <Band heading={heading} headingId={headingId}>
      {/*
        role="alert", NOT aria-live="polite" ON A FRESHLY MOUNTED NODE.
        A live region announces CHANGES to content inside a region the
        screen reader was already watching. This div and its text mount
        in the same commit - the region does not exist before the text
        does - so the polite region announced nothing at all, on every
        band failure, since it was written. Nothing failed, because a
        live region that never fires looks identical in the DOM to one
        that works.

        `role="alert"` carries an implicit assertive live region AND is
        announced when the node is inserted, which is exactly this
        case: the band failed, the message appeared, and the resident
        needs to hear it rather than discover a silently empty band
        where the balance was.

        Assertive is right here despite interrupting. The band this
        most often is, is the balance - and a resident who is told
        nothing reads an empty slot as a society with no money.
      */}
      <div role="alert">
        <p className="text-on-surface-variant max-w-[68ch] mb-space-md">{explanation}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            // min-h-11: the same floor as every other control. A retry
            // is often tapped on a bad connection, one-handed, by
            // someone already mildly annoyed.
            className="min-h-11 px-space-md border border-outline-variant rounded-sm text-on-surface"
          >
            Try again
          </button>
        )}
      </div>
    </Band>
  )
}
