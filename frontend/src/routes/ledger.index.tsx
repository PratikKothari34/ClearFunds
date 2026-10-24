import { createFileRoute } from '@tanstack/react-router'
import { LedgerList } from '../components/LedgerList'
import { BandFallback } from '../components/BandFallback'
import { LedgerSummary } from '../components/LedgerSummary'
import { devLedger } from '../lib/devData'
import { inChainOrder } from '../lib/ledger'

export const Route = createFileRoute('/ledger/')({
  component: LedgerAll,
})

/**
 * The whole history. No filter applied, and the summary line says so.
 *
 * The summary is not decoration: on every other tab it reports how many
 * entries the filter EXCLUDED. A resident who lands on a filtered
 * ledger without being told reads a partial record as the complete one.
 */
function LedgerAll() {
  /*
   * Read ONCE. `devLedger()` was called twice here and three times on
   * each other tab. Harmless against a fixture; at cutover each call is
   * a query, and `shown` and `total` taken from two reads can disagree
   * on a page whose whole job is to say how much of the record is
   * showing.
   */
  const loaded = devLedger()

  /*
   * ABSENT IS NOT EMPTY, and on this page the difference is the whole
   * product. `devLedger()` returns null when the history was not
   * fetched; an empty list says the society has never recorded a
   * rupee. Rendering the empty-list copy for a failed read tells a
   * resident the ledger is blank, which is the single most damaging
   * false statement this surface can make.
   */
  if (loaded === null) {
    return (
      <BandFallback
        heading="The history could not be loaded"
        headingId="cf-ledger-absent"
        explanation="The ledger did not load, so nothing is listed below. This is not a statement that the society has no entries — it means the record was not reached. Nothing has been changed."
      />
    )
  }

  const entries = inChainOrder(loaded)

  return (
    <>
      <LedgerSummary shown={entries.length} total={entries.length} />
      <LedgerList entries={entries} />
    </>
  )
}
