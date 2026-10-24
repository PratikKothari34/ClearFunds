import { createFileRoute } from '@tanstack/react-router'
import { LedgerList } from '../components/LedgerList'
import { BandFallback } from '../components/BandFallback'
import { LedgerSummary } from '../components/LedgerSummary'
import { devLedger } from '../lib/devData'
import { inChainOrder } from '../lib/ledger'

export const Route = createFileRoute('/ledger/flagged')({
  component: LedgerFlagged,
})

/**
 * Entries with an unresolved question against them.
 *
 * UNRESOLVED only. A resolved flag leaves this view and stays in the
 * entry's append-only log — the log is the record, the count is a
 * to-do list. An empty view here means every question has been
 * answered, which is the state a society should normally be in, so the
 * empty copy says that rather than implying something is missing.
 *
 * A flag has no financial effect. Residents raise questions; only
 * admins reverse. Nothing on this surface offers to change an amount.
 */
function LedgerFlagged() {
  const loaded = devLedger()

  /*
   * Absent, not empty. The empty copy on this tab asserts that every
   * question raised has been answered — a claim about the
   * committee's responsiveness. A failed read is not entitled to make
   * it.
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

  // Read once: `shown` and `total` must come from the same read.
  const all = inChainOrder(loaded)
  const entries = all.filter((e) => e.openFlagCount > 0)

  return (
    <>
      <LedgerSummary
        shown={entries.length}
        total={all.length}
        filterLabel="with a question nobody has answered yet"
      />
      <LedgerList
        entries={entries}
        emptyMessage="Every question raised so far has been answered. Answered questions stay in each entry's history."
      />
    </>
  )
}
