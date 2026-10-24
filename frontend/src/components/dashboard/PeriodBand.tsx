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
       * screen reader then announces the pairing. Two columns at every
       * width: at 320px the two amounts still fit side by side, and
       * stacking them would make the comparison a scroll.
       */}
      <dl className="flex gap-(--cf-s4)">
        <div>
          <dt className="text-meta text-ink-quiet">Money in</dt>
          <dd className="m-0 mt-0.5">
            <Amount value={period.inflow} direction="in" />
          </dd>
        </div>
        <div>
          <dt className="text-meta text-ink-quiet">Money out</dt>
          <dd className="m-0 mt-0.5">
            <Amount value={period.outflow} direction="out" />
          </dd>
        </div>
      </dl>
    </Band>
  )
}
