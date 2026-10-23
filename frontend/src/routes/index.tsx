import { createFileRoute } from '@tanstack/react-router'
import { BalanceBand } from '../components/dashboard/BalanceBand'
import { AttentionBand } from '../components/dashboard/AttentionBand'
import { FingerprintBand } from '../components/dashboard/FingerprintBand'
import { PeriodBand } from '../components/dashboard/PeriodBand'
import { RecentBand } from '../components/dashboard/RecentBand'
import { useBandStates, type BandName } from '../lib/bands'
import { devAnchor, devDashboard } from '../lib/devData'

export const Route = createFileRoute('/')({
  component: Home,
})

/**
 * The home dashboard. Five bands, fixed order, nothing collapses.
 *
 * The order is the design and is not a layout preference: band
 * positions are identical on every visit, so they are learnable and tap
 * targets never move. Band 2 reserves its slot even when empty, and
 * band 3 never disappears because its absence would read as a pass.
 *
 * THE BANDS FETCH INDEPENDENTLY. The dashboard is not held on the
 * fingerprint fetch, which is cross-origin and the slowest thing on the
 * screen. Each band owns its own failed state and its own retry, and a
 * failed band renders a retry rather than an empty slot — in this
 * design an empty slot carries meaning, so a silent failure would say
 * something untrue (see BandFallback).
 *
 * Independence is modelled HERE, not left until the endpoints arrive.
 * One shared `failed` flag would have been less code and would have
 * made every band fail together, which is the one behaviour the design
 * rules out; and a failure branch that nothing can reach is a branch
 * that is wrong by the time it is needed.
 *
 * Data is sample data until the endpoints exist. It lives in one module
 * so there is a single thing to delete at the cutover; each band's
 * `failed` prop is where its query's error state will be wired in.
 */
function Home() {
  const data = devDashboard()
  const band = useBandStates()

  /*
   * No data is the SAME state as a failed fetch, and routes through the
   * same prop.
   *
   * `devDashboard()` returns null in a production build, because the
   * fixture is not in that bundle and `DashboardData` has no honest
   * empty value: every field is required, a zero balance is a financial
   * claim, and an absent date is not a date. The design already settles
   * what the screen does here - "a failed band renders a retry rather
   * than an empty slot", because in this layout an empty slot carries
   * meaning and would say something untrue.
   *
   * So absent data sets each band's existing `failed` prop instead of
   * introducing a second not-yet-loaded state that renders differently.
   * Two code paths for "this band has no figure to show" would drift,
   * and the one that is harder to reach is the one that would be wrong.
   */
  const absent = data === null

  // One helper per band rather than a loop: each band takes a
  // different data shape, and the explicit list is what makes a
  // forgotten band visible at a glance.
  const props = (name: BandName) => ({
    failed: absent || band.failed(name),
    onRetry: () => band.retry(name),
  })

  /*
   * The placeholders below are never READ when `absent` is true: each
   * band renders its retry instead of its figures. They exist because
   * the props are typed non-optional, and they are deliberately not
   * plausible-looking - a zero balance that reached the screen would be
   * a lie about the society's money, so if one of these ever becomes
   * visible it must be obvious that the band is broken, not that the
   * balance is nil.
   */
  const balance = data?.balance ?? { minor: 0, currency: 'INR' }
  const period =
    data?.period ?? {
      label: '',
      inflow: { minor: 0, currency: 'INR' },
      outflow: { minor: 0, currency: 'INR' },
    }

  return (
    <>
      <BalanceBand
        balance={balance}
        asOf={data?.asOf ?? ''}
        entryCount={data?.entryCount ?? 0}
        {...props('balance')}
      />
      <AttentionBand items={data?.attention ?? []} {...props('attention')} />
      <FingerprintBand status={devAnchor()} {...props('fingerprint')} />
      <PeriodBand period={period} {...props('period')} />
      <RecentBand entries={data?.recent ?? []} {...props('recent')} />
    </>
  )
}
