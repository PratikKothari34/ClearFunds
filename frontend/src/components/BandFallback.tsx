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
        aria-live polite: a band that fills in after a retry should be
        announced, but a failure is a status change and not an
        interruption.
      */}
      <div aria-live="polite">
        <p className="text-ink-quiet max-w-[68ch] mb-(--cf-s2)">{explanation}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            // min-h-11: the same floor as every other control. A retry
            // is often tapped on a bad connection, one-handed, by
            // someone already mildly annoyed.
            className="min-h-11 px-(--cf-s2) border border-rule rounded-sm text-ink"
          >
            Try again
          </button>
        )}
      </div>
    </Band>
  )
}
