import { Band } from '../Band'
import { Amount } from '../Amount'
import { BandFallback } from '../BandFallback'
import type { Money } from '../../lib/types'
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
 */

export function BalanceBand({
  balance,
  asOf,
  entryCount,
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

  return (
    <Band>
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
      <h2 className="font-sans text-figure font-medium leading-none m-0">
        <span className="cf-sr-only">Money the society holds: </span>
        <Amount value={balance} />
      </h2>
      <p className="text-meta text-ink-quiet mt-(--cf-s2)">
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
            {' · '}
            <span className="cf-tabular">
              {entryCount.toLocaleString('en-IN')}
            </span>{' '}
            {entryCount === 1 ? 'entry' : 'entries'}
          </>
        )}
      </p>
    </Band>
  )
}
