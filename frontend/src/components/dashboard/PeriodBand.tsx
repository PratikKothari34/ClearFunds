import { Band } from '../Band'
import { Amount } from '../Amount'
import { BandFallback } from '../BandFallback'
import type { DashboardData } from '../../lib/types'

/**
 * Band 4. In and out for the current period.
 *
 * Both figures are server-computed. The frontend does not subtract one
 * from the other to show a net, even though it would be trivial: a net
 * derived here from two numbers is a third number the chain never
 * signed, and if the two figures ever disagree with the balance above
 * it must be visible rather than smoothed over by arithmetic done at
 * the last moment.
 *
 * Labelled "Money in" / "Money out" rather than credit and debit.
 * The audience is a resident, not a bookkeeper.
 *
 * THE FIGURES SIT IN A COLUMN, right-aligned against the field's edge,
 * with the label on the left. That is how an amount appears in the
 * register this product replaces, and it is the arrangement that lets
 * two figures be compared digit by digit - tabular figures only line up
 * if the numbers share an edge. Side-by-side columns of
 * label-above-figure looked like a stat row on any dashboard and put
 * the two amounts at different horizontal positions, which is the one
 * thing that makes them hard to compare.
 */

export function PeriodBand({
  period,
  failed = false,
  onRetry,
}: {
  readonly period: DashboardData['period']
  /**
   * When this band fails its heading has to change, because the normal
   * heading IS data — `period.label` arrives with the figures. A
   * fallback that kept "October 2026" above an error would be claiming
   * to know which period failed to load.
   */
  readonly failed?: boolean
  readonly onRetry?: () => void
}) {
  if (failed) {
    return (
      <BandFallback
        heading="Couldn't load this period"
        headingId="cf-band-period"
        explanation="The money in and out for this period did not load. The balance above is a separate figure and is unaffected."
        onRetry={onRetry}
      />
    )
  }

  return (
    <Band heading={period.label} headingId="cf-band-period">
      {/*
       * A definition list, because these are label-value pairs and a
       * screen reader then announces the pairing.
       *
       * One row per figure, label left and amount right, rather than the
       * two side-by-side blocks this used to be. That earlier note said
       * stacking would make the comparison a scroll; it would have, as
       * two label-above-figure blocks, but a two-row grid costs about
       * 24px and never scrolls. What it buys is the shared right edge -
       * both amounts end at the same x, which is the only arrangement in
       * which tabular figures actually line up digit against digit.
       */}
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-space-lg">
        <dt className="text-on-surface-variant py-space-sm">Money in</dt>
        <dd className="m-0 py-space-sm text-right">
          <Amount amount={period.inflow} direction="in" />
        </dd>
        <dt className="text-on-surface-variant py-space-sm border-t border-outline-variant">
          Money out
        </dt>
        <dd className="m-0 py-space-sm text-right border-t border-outline-variant">
          <Amount amount={period.outflow} direction="out" />
        </dd>
      </dl>
    </Band>
  )
}
