import { createFileRoute } from '@tanstack/react-router'
import { LedgerList } from '../components/LedgerList'
import { LedgerSummary } from '../components/LedgerSummary'
import { SAMPLE_LEDGER } from '../lib/sample'

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
  const entries = SAMPLE_LEDGER.filter((e) => e.openFlagCount > 0)

  return (
    <>
      <LedgerSummary
        shown={entries.length}
        total={SAMPLE_LEDGER.length}
        filterLabel="with a question nobody has answered yet"
      />
      <LedgerList
        entries={entries}
        emptyMessage="Every question raised so far has been answered. Answered questions stay in each entry's history."
      />
    </>
  )
}
