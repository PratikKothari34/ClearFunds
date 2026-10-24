import { createFileRoute } from '@tanstack/react-router'
import { LedgerList } from '../components/LedgerList'
import { BandFallback } from '../components/BandFallback'
import {
  LEDGER_UNREACHED_EXPLANATION,
  LEDGER_UNREACHED_HEADING,
} from '../lib/ledgerFallback'
import { LedgerSummary } from '../components/LedgerSummary'
import { devLedger } from '../lib/devData'
import { inChainOrder, reversedRows } from '../lib/ledger'

export const Route = createFileRoute('/ledger/reversed')({
  component: LedgerReversed,
})

/**
 * Corrections only: entries that were cancelled, each shown with the
 * correction that cancelled it.
 *
 * ONE ROW PER CORRECTION, not two. The pair is the unit — but it is
 * one row item of variable height, with the reversal rendered as a
 * link beside the entry it cancels, never as a row of its own.
 * Admitting both states as top-level rows listed each correction
 * twice: struck through as money out, then again as money in, the same
 * reason under both, with a count above saying two entries. See
 * `reversedRows`.
 *
 * Filtering is done here against sample data. On real data it is a
 * server-side filter: the server reports how many entries it excluded,
 * because a count derived from a page of rows is wrong whenever the
 * page is short.
 */
function LedgerReversed() {
  /*
   * `reversedRows`, not a filter admitting both states. A reversal is
   * rendered as a link beside the entry it cancels, so listing it as
   * its own row shows one correction twice — struck through as money
   * out, then again as money in, same reason under both, "2 entries"
   * above. Read once so `shown` and `total` agree.
   */
  const loaded = devLedger()

  /*
   * Absent, not empty. The empty copy here says no entry has ever been
   * cancelled, which on a tamper-evident ledger is a claim about the
   * committee's conduct rather than a neutral blank.
   */
  if (loaded === null) {
    return (
      <BandFallback
        heading={LEDGER_UNREACHED_HEADING}
        headingId="cf-ledger-absent"
        explanation={LEDGER_UNREACHED_EXPLANATION}
      />
    )
  }

  const all = inChainOrder(loaded)
  const entries = reversedRows(all)

  return (
    <>
      <LedgerSummary
        shown={entries.length}
        total={all.length}
        filterLabel="that were cancelled, each shown with the correction that cancelled it"
      />
      <LedgerList
        entries={entries}
        emptyMessage="No entry has been cancelled. Corrections appear here when one is."
      />
    </>
  )
}
