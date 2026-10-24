import { Band } from '../Band'
import { Amount } from '../Amount'
import { BandFallback } from '../BandFallback'
import type { Money } from '../../lib/types'
import { formatDate } from '../../lib/dates'

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
       */}
      <h2 className="font-sans text-figure font-medium leading-none m-0">
        <Amount value={balance} />
      </h2>
      <p className="text-meta text-ink-quiet mt-(--cf-s2)">
        as of {formatDate(asOf)}
        {' · '}
        <span className="cf-tabular">{entryCount.toLocaleString('en-IN')}</span>{' '}
        {entryCount === 1 ? 'entry' : 'entries'}
      </p>
    </Band>
  )
}
