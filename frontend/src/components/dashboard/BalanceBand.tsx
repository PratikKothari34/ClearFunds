import { Band } from '../Band'
import { Amount } from '../Amount'
import { BandFallback } from '../BandFallback'
import { AnchorBody, resolveShown } from './FingerprintBand'
import type { AnchorStatus, Money } from '../../lib/types'
import { formatDate } from '../../lib/dates'
import { isShowableCount } from '../../lib/countable'

/**
 * Band 1. Never collapses, never has a label above the figure.
 *
 * 39px at weight 500 with tabular figures. This is the one number the
 * majority of this product's audience opens the app to read, so it is
 * the largest thing on the screen and nothing competes with it.
 *
 * The meta line carries the entry count beside the date, because a
 * balance with no indication of how much history produced it is a
 * number a resident has no way to situate.
 *
 * THE TWO FACTS ARE SEPARATED BY A RULE, NOT A MIDDLE DOT. `A - B - C`
 * joined with middle dots is the meta line every generated page builds,
 * and it reads as one run-on string rather than as two separate facts.
 * A vertical rule between them is the register's own device and says
 * the same thing with less noise.
 *
 * THE PROVENANCE IS PART OF THIS BLOCK (2026-10-25), not a band three
 * scrolls down. A resident opens this app with one question - how much
 * money is there, and can I trust the number - and the design used to
 * answer it in two separate sections of equal weight, so the trust
 * half was something you could scroll past without noticing. The
 * figure and the record it was checked against are now one subject
 * with one hairline between them, and that hairline is the only rule
 * in the block: it divides the number from its evidence, which is a
 * real boundary rather than texture.
 *
 * A MISMATCH IS HOISTED ABOVE THE FIGURE. Its copy ends "do not rely
 * on the figures above", which is only true if the warning is read
 * first. Under the number it would be read second, or not at all, so
 * in this block the warning comes first and `AnchorBody` is told not
 * to repeat it. This is the one hazard the merge introduces and it is
 * handled here rather than left to the reader's scroll position.
 */

export function BalanceBand({
  balance,
  asOf,
  entryCount,
  anchor,
  anchorPending = false,
  anchorFailed = false,
  onAnchorRetry,
  failed = false,
  onRetry,
}: {
  readonly balance: Money
  /**
   * ISO 8601. Formatted by `formatDate`, which is pinned to `en-IN` and
   * `Asia/Kolkata` - NOT the device locale. A resident reading from
   * abroad must see the same date the society means, because the day a
   * balance was taken decides which financial year it belongs to.
   */
  readonly asOf: string
  readonly entryCount: number
  /**
   * The published-record check, hosted in this block. Optional and
   * independently fetched: the anchor comes from outside the
   * committee's control and routinely resolves later than the balance,
   * or not at all.
   *
   * EACH HALF MUST FAIL ALONE. A balance that loaded renders even when
   * the anchor is still pending or unreachable, and the provenance
   * renders even on a failure (as `unreachable`, which is a real state
   * rather than a blank). Nothing here may make one fetch's outcome
   * depend on the other's - that would turn two honest partial answers
   * into one missing section.
   */
  readonly anchor?: AnchorStatus
  readonly anchorPending?: boolean
  readonly anchorFailed?: boolean
  readonly onAnchorRetry?: () => void
  /**
   * The band this one most needs a failure state. A missing balance
   * rendered as an empty slot reads as a society with no money, which
   * is the single most alarming thing this product could say by
   * accident. Showing a stale figure would be worse again, so it shows
   * neither.
   */
  readonly failed?: boolean
  readonly onRetry?: () => void
}) {
  if (failed) {
    return (
      <BandFallback
        heading="Couldn't load the balance"
        headingId="cf-band-balance"
        explanation="The balance did not load. Nothing below has changed, and no money has moved — this is a problem reaching the record, not a problem with it."
        onRetry={onRetry}
      />
    )
  }

  // Resolved with the SAME function the standalone band uses, so a
  // failed anchor fetch cannot read as a pass in one place and not the
  // other.
  const shownAnchor = resolveShown(anchor, anchorFailed)
  const mismatched = shownAnchor?.state === 'mismatch'

  return (
    <Band tone="primary">
      {/*
       * The mismatch warning, BEFORE the figure. See the docblock: its
       * own copy says not to rely on the figures above, so it has to
       * be the first thing read, and `AnchorBody` below is told not to
       * print it twice.
       */}
      {mismatched && (
        <p className="text-on-error-container max-w-[68ch] mb-space-lg">
          <span aria-hidden="true">⚠ </span>
          What this app is showing does not match the published record.
        </p>
      )}
      {/*
       * The figure is a heading, so it is the first thing in the rotor
       * after the society name. Styled by the band rather than by h2's
       * defaults.
       *
       * AND IT SAYS WHAT THE NUMBER IS. The heading was the bare
       * amount, so a screen reader's heading rotor announced
       * "1,250 rupees 75 paise" with nothing to say whether that was
       * the society's balance, this month's spending or the dues
       * outstanding - the three figures this product shows. The
       * visible design rule is that this band never carries a label
       * above the figure, which is why the label is visually hidden
       * rather than dropped.
       */}
      <h2 className="font-tabular-currency-lg text-tabular-currency-lg font-medium leading-none m-0">
        <span className="cf-sr-only">Money the society holds: </span>
        <Amount value={balance} />
      </h2>
      <p className="font-label-code-sm text-label-code-sm text-on-surface-variant mt-space-md">
        as of {formatDate(asOf)}
        {/*
         * THE COUNT IS DROPPED WHEN IT IS NOT A COUNT, rather than
         * printed as whatever arrived.
         *
         * `NaN.toLocaleString('en-IN')` returns the string "NaN", so an
         * entry count that arrived as a string the server did not mean
         * to send, or as a subtraction against a missing field, put
         * "NaN entries" under the one figure the majority of this
         * product's audience opens the app to read. Beside a balance,
         * that reads as a fault in the money rather than in a
         * subtitle.
         *
         * The balance itself still shows: the count is context for
         * situating it, so losing the context is not a reason to
         * withhold the figure - and this band's own rule is that it
         * never collapses.
         */}
        {isShowableCount(entryCount) && (
          <>
            {/*
             * The rule is decoration, so it is aria-hidden - which
             * means it carries NO WORD BOUNDARY. Without the comma
             * beside it the band read "as of 25 Oct 202642 entries",
             * running the year into the count: a garbled number under
             * the one figure this product exists to show. The comma is
             * visually hidden so the rule remains the only separator
             * anyone sees.
             */}
            <span className="cf-sr-only">, </span>
            <span
              aria-hidden="true"
              className="inline-block mx-space-md border-l border-outline-variant h-[1em] align-[-0.15em]"
            />
            <span className="cf-tabular">
              {entryCount.toLocaleString('en-IN')}
            </span>{' '}
            {entryCount === 1 ? 'entry' : 'entries'}
          </>
        )}
      </p>
      {/*
       * The one rule inside the block, and it is doing real work:
       * everything above is the figure, everything below is the
       * evidence for it. `aria-live` because the anchor resolves after
       * the balance, so this region changes under a reader who is
       * already here.
       */}
      <div
        aria-live="polite"
        className="mt-space-lg pt-space-lg border-t border-outline-variant"
      >
        {/*
         * Pending is the honest state while the fetch is open. It is
         * NOT rendered as a pass, and the figure above is already
         * readable - which is the point of the two halves failing
         * independently.
         */}
        {!anchorFailed && (anchorPending || !anchor) ? (
          <p className="font-label-code-sm text-label-code-sm text-on-surface-variant max-w-[68ch]">
            Checking against the published record…
          </p>
        ) : shownAnchor ? (
          <>
            <AnchorBody status={shownAnchor} hideMismatch />
            {anchorFailed && onAnchorRetry && (
              <p className="mt-space-md">
                <button
                  type="button"
                  onClick={onAnchorRetry}
                  className="min-h-11 px-space-md border border-outline-variant rounded-sm text-on-surface"
                >
                  Check again
                </button>
              </p>
            )}
          </>
        ) : null}
      </div>
    </Band>
  )
}
