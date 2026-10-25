import { createFileRoute } from '@tanstack/react-router'
import { BalanceBand } from '../components/dashboard/BalanceBand'
import { AttentionBand } from '../components/dashboard/AttentionBand'
import { PeriodBand } from '../components/dashboard/PeriodBand'
import { RecentBand } from '../components/dashboard/RecentBand'
import { useBandStates, type BandName } from '../lib/bands'
import { devAnchor, devDashboard } from '../lib/devData'
import { inChainOrder } from '../lib/ledger'

export const Route = createFileRoute('/')({
  component: Home,
})

/**
 * The home dashboard. Four blocks, fixed order, nothing collapses.
 *
 * It was five bands of identical weight - same padding, same heading
 * size, same two hairlines each - which put ten rules down a phone at
 * even spacing and gave the eye nowhere to land. Restructured
 * 2026-10-25 so the hierarchy answers the question a resident actually
 * arrives with:
 *
 *   1. The balance, WITH the published-record check attached to it
 *      under one hairline. One subject: a number, and the evidence for
 *      trusting it. This is the only block with the `primary` tone.
 *   2. What needs the viewer - the only block allowed to raise its
 *      voice, and it already owns the warning colour.
 *   3. This month.
 *   4. Recent entries.
 *
 * The order is the design and is not a layout preference: positions are
 * identical on every visit, so they are learnable and tap targets never
 * move. Block 2 reserves its slot even when empty, and the record check
 * never disappears because its absence would read as a pass.
 *
 * THE BANDS STILL FETCH INDEPENDENTLY, and merging two of them into
 * one block did NOT merge their states: 'fingerprint' remains its own
 * BandName with its own failed flag and its own retry, handed to the
 * balance block under anchor-prefixed props. The dashboard is not held
 * on the fingerprint fetch, which is cross-origin and the slowest thing
 * on the screen, and a balance that loaded renders whatever the anchor
 * did. Guarded by balanceProvenance.test.tsx, because the merge from
 * five bands to four passed 479 existing tests without one noticing. Each band owns its own failed state and its own retry, and a
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
  /*
   * SORTED HERE TOO, by the same rule as the ledger tabs.
   *
   * This was `data?.recent ?? []` passed straight through, which made
   * the band the one surface that trusted the server's array order.
   * The reasoning in `inChainOrder` is not specific to the ledger page:
   * these rows are read top to bottom as a sequence, so array order IS
   * the claim being made, and nothing in the wire contract promises it.
   * The fixture's own head is 847, 846, 845, 848 - the newest entry
   * fourth - so the band was visibly wrong in the current build while
   * every ledger tab beside it was right.
   */
  const recent = inChainOrder(data?.recent ?? [])

  const period =
    data?.period ?? {
      label: '',
      inflow: { minor: 0, currency: 'INR' },
      outflow: { minor: 0, currency: 'INR' },
    }

  return (
    <>
      {/*
       * The balance and its provenance are ONE block, and the two
       * still fetch and fail independently - 'fingerprint' remains its
       * own BandName with its own failed state and its own retry,
       * passed in under anchor-prefixed props. Merging the two states
       * into one would make a reachable balance depend on a reachable
       * anchor, which is exactly the coupling the band design exists
       * to avoid.
       */}
      <BalanceBand
        balance={balance}
        asOf={data?.asOf ?? ''}
        entryCount={data?.entryCount ?? 0}
        anchor={devAnchor()}
        anchorFailed={absent || band.failed('fingerprint')}
        onAnchorRetry={() => band.retry('fingerprint')}
        {...props('balance')}
      />
      <AttentionBand items={data?.attention ?? []} {...props('attention')} />
      <PeriodBand period={period} {...props('period')} />
      <RecentBand entries={recent} {...props('recent')} />
    </>
  )
}
