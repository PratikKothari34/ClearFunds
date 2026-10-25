import { createFileRoute } from '@tanstack/react-router'
import { LedgerList } from '../components/LedgerList'
import { BandFallback } from '../components/BandFallback'
import {
  LEDGER_UNREACHED_EXPLANATION,
  LEDGER_UNREACHED_HEADING,
} from '../lib/ledgerFallback'
import { isShowableCount, isUnreadableCount } from '../lib/countable'
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
        heading={LEDGER_UNREACHED_HEADING}
        headingId="cf-ledger-absent"
        explanation={LEDGER_UNREACHED_EXPLANATION}
      />
    )
  }

  // Read once: `shown` and `total` must come from the same read.
  const all = inChainOrder(loaded)

  /*
   * PARTITIONED, because this tab's empty copy is a CLAIM and
   * `isShowableCount` is a display guard.
   *
   * `isShowableCount` answers "may I print this number", and its
   * right answer for junk is silence. This filter was asking it a
   * different question - "does this entry have an open question" -
   * where silence is the wrong answer: an entry whose flag count
   * arrived unreadable was dropped from the list, and the empty copy
   * below then asserted that every question raised has been answered.
   * That is this product stating a conclusion about the committee's
   * responsiveness off data it could not read.
   *
   * `sign-off.tsx` already reads this exact field the right way, with
   * `isUnreadableCount` beside the display guard. This is the same
   * field and the same rule.
   */
  const entries = all.filter((e) => isShowableCount(e.openFlagCount))
  const unreadable = all.filter((e) => isUnreadableCount(e.openFlagCount))

  return (
    <>
      <LedgerSummary
        shown={entries.length}
        total={all.length}
        filterLabel="with a question nobody has answered yet"
      />
      {/*
       * The gap is disclosed above the list, so it is read before the
       * absence of rows is interpreted.
       */}
      {unreadable.length > 0 && (
        <p className="mt-0 mb-(--cf-s3) text-meta text-break max-w-[68ch]">
          <span className="cf-tabular">{unreadable.length}</span>{' '}
          {unreadable.length === 1 ? 'entry' : 'entries'} could not be checked
          for open questions, so this list may be incomplete.
        </p>
      )}
      <LedgerList
        entries={entries}
        /*
         * THE REASSURING COPY IS WITHHELD WHEN ANYTHING WAS
         * UNREADABLE. An empty list here normally means every question
         * has been answered - a good state worth stating. It cannot be
         * stated over entries that were never checked, so the fallback
         * says only what is true: nothing is shown.
         */
        emptyMessage={
          unreadable.length > 0
            ? "No entries with an open question are shown. Some entries could not be checked, so this is not a statement that every question has been answered."
            : "Every question raised so far has been answered. Answered questions stay in each entry's history."
        }
      />
    </>
  )
}
