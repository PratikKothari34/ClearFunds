import { createFileRoute } from '@tanstack/react-router'
import { LedgerList } from '../components/LedgerList'
import { LedgerSummary } from '../components/LedgerSummary'
import { devLedger } from '../lib/devData'

export const Route = createFileRoute('/ledger/reversed')({
  component: LedgerReversed,
})

/**
 * Corrections only: entries that were cancelled, and the entries that
 * cancelled them.
 *
 * BOTH sides are included on purpose. Showing only the cancelled
 * entries would list money that left and never came back; showing only
 * the reversals would list money arriving for no reason. The pair is
 * the correction, so the filter keeps the pair.
 *
 * Filtering is done here against sample data. On real data it is a
 * server-side filter: the server reports how many entries it excluded,
 * because a count derived from a page of rows is wrong whenever the
 * page is short.
 */
function LedgerReversed() {
  const entries = devLedger().filter(
    (e) => e.state === 'reversed' || e.state === 'reversal',
  )

  return (
    <>
      <LedgerSummary
        shown={entries.length}
        total={devLedger().length}
        filterLabel="that were cancelled or that cancel another entry"
      />
      <LedgerList
        entries={entries}
        emptyMessage="No entry has been cancelled. Corrections appear here when one is."
      />
    </>
  )
}
