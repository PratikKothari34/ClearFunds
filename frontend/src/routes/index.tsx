import { createFileRoute } from '@tanstack/react-router'
import { BalanceBand } from '../components/dashboard/BalanceBand'
import { AttentionBand } from '../components/dashboard/AttentionBand'
import { FingerprintBand } from '../components/dashboard/FingerprintBand'
import { PeriodBand } from '../components/dashboard/PeriodBand'
import { RecentBand } from '../components/dashboard/RecentBand'
import { SAMPLE_ANCHOR, SAMPLE_DASHBOARD } from '../lib/sample'
import { useBandStates, type BandName } from '../lib/bands'

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
  const data = SAMPLE_DASHBOARD
  const band = useBandStates()

  // One helper per band rather than a loop: each band takes a
  // different data shape, and the explicit list is what makes a
  // forgotten band visible at a glance.
  const props = (name: BandName) => ({
    failed: band.failed(name),
    onRetry: () => band.retry(name),
  })

  return (
    <>
      <BalanceBand
        balance={data.balance}
        asOf={data.asOf}
        entryCount={data.entryCount}
        {...props('balance')}
      />
      <AttentionBand items={data.attention} {...props('attention')} />
      <FingerprintBand status={SAMPLE_ANCHOR} {...props('fingerprint')} />
      <PeriodBand period={data.period} {...props('period')} />
      <RecentBand entries={data.recent} {...props('recent')} />
    </>
  )
}
