import { Link, createFileRoute } from '@tanstack/react-router'
import { Amount } from '../components/Amount'
import { Band } from '../components/Band'
import { Cancelled } from '../components/Cancelled'
import { BandFallback } from '../components/BandFallback'
import { Fingerprint } from '../components/Fingerprint'
import { FlagHistory } from '../components/FlagHistory'
import { formatDate, formatDateTime } from '../lib/dates'
import { cancelledEffect, cancelledNoun } from '../lib/cancelledCopy'
import { devFlagLog, devLedger } from '../lib/devData'

export const Route = createFileRoute('/ledger/$entryId')({
  component: EntryDetail,
})

/**
 * One entry, in full.
 *
 * This is the page a resident reaches from a struck-through row, so the
 * correction relationship is stated in words at the top rather than
 * implied by styling. Someone who did not understand the strike-through
 * is exactly who arrives here.
 *
 * It is also where the entry's own fingerprint is shown and where the
 * flag log lives — the log, not the count. Resolved questions stay
 * visible here forever; only the count on the ledger drops.
 */
function EntryDetail() {
  const { entryId } = Route.useParams()
  const ledger = devLedger()

  /*
   * ABSENT BEFORE NOT-FOUND, and the order matters here more than
   * anywhere else.
   *
   * With a null ledger a `.find` returns undefined, so the branch
   * below fires and tells a resident "There is no entry with that
   * reference" — about an entry that exists, reached from a link in
   * an AGM report they were handed. Denying a record exists is the
   * precise opposite of what a tamper-evident ledger is for, and it
   * would be the product's own fault presented as the record's.
   */
  if (ledger === null) {
    return (
      <BandFallback
        heading="This entry could not be loaded"
        headingId="cf-entry-absent"
        explanation="The history did not load, so this entry cannot be shown. This is NOT a statement that the entry does not exist. Try again, or open the history and find it there."
      />
    )
  }

  const entry = ledger.find((e) => e.id === entryId)

  if (!entry) {
    return (
      <Band heading="Entry not found" headingId="cf-entry-missing">
        <p className="text-ink-quiet max-w-[68ch]">
          There is no entry with that reference. It may have been a link from
          an older report.{' '}
          <Link
            to="/ledger"
            className="text-anchor underline decoration-1 underline-offset-2"
          >
            Go back to the history
          </Link>
          .
        </p>
      </Band>
    )
  }

  const reversed = entry.state === 'reversed'
  /*
   * ABSENT IS NOT EMPTY, and the earlier reasoning here was wrong.
   *
   * It said a null log "already renders as no questions" and that a
   * fallback would hide the record to report a missing sidebar. The
   * second half is right — the entry must stay on screen — but `?? []`
   * does not render "no questions", it renders "Nobody has asked about
   * this entry.", which is a statement ABOUT the entry that a resident
   * acts on by closing the page. A failed read must never produce it:
   * an unanswered question about this very payment would sit invisible
   * while the page said nobody had asked.
   *
   * So the distinction is kept and passed down: `null` means not
   * fetched, `[]` means genuinely nobody.
   */
  const log = devFlagLog()?.[entry.id] ?? null

  return (
    <>
      <Band>
        <p className="m-0 text-meta text-ink-quiet">
          Entry <span className="cf-tabular">#{entry.sequence}</span> ·{' '}
          {formatDateTime(entry.postedAt)}
        </p>

        <h2 className="font-serif text-head font-normal mt-(--cf-s1) mb-(--cf-s2) max-w-[48ch]">
          {entry.narration}
        </h2>

        {/*
         * The amount is struck through here as well as on the row. A
         * detail page showing a clean figure for a cancelled payment is
         * how a resident concludes the strike-through on the list was a
         * rendering glitch.
         */}
        <p className={`m-0 text-figure font-medium ${reversed ? 'text-ink-quiet' : ''}`}>
          {/*
           * `Cancelled`, not a hand-rolled pair. The strike and the
           * visually-hidden word were written out separately at three
           * call sites, and one of them - this row's amount in
           * EntryRow - had the strike without the word. One component
           * is what makes that impossible rather than merely noticed.
           */}
          {reversed ? (
            <Cancelled>
              <Amount value={entry.amount} direction={entry.direction} />
            </Cancelled>
          ) : (
            <Amount value={entry.amount} direction={entry.direction} />
          )}
        </p>

        {/*
         * Stated in words, immediately under the amount, because this is
         * the sentence the strike-through was standing in for.
         */}
        {/*
          GATED ON `reversed` ALONE, and the details degrade inside.
          This was `reversed && entry.reversedBy`, so an entry whose
          state says cancelled but which arrived without its reversal
          reference rendered a struck-through amount and not one word -
          and the strike is the thing this sentence exists to explain.
          A resident reads an unexplained strike as a display glitch,
          which is the opposite of what a cancelled payment should
          communicate.

          Same bug `EntryRow` already fixed; its comment says to gate on
          `reversed` alone. The date and the link are what is actually
          missing, so they are what degrades - never the statement that
          the money does not count.
        */}
        {reversed && (
          <p className="mt-(--cf-s2) mb-0 pl-(--cf-s2) border-l-2 border-break text-break max-w-[68ch]">
            {entry.reversedBy ? (
              <>
                This {cancelledNoun(entry.direction)} was cancelled on{' '}
                {formatDate(entry.reversedBy.postedAt)}.
              </>
            ) : (
              // No date, so none is invented. "Cancelled" without a
              // date is the honest subset; a guessed date on a
              // cancelled entry is a fact nobody can check.
              <>This {cancelledNoun(entry.direction)} was cancelled.</>
            )}{' '}
            {cancelledEffect(entry.direction)}
            {entry.reversalReason && <> Reason given: {entry.reversalReason}</>}
            {entry.reversedBy && (
              <>
                {' '}
                <Link
                  to="/ledger/$entryId"
                  params={{ entryId: entry.reversedBy.id }}
                  className="underline decoration-1 underline-offset-2"
                >
                  See the correction
                </Link>
                .
              </>
            )}
          </p>
        )}

        {entry.state === 'reversal' && entry.reverses && (
          <p className="mt-(--cf-s2) mb-0 pl-(--cf-s2) border-l-2 border-rule text-ink-quiet max-w-[68ch]">
            This entry is a correction. It cancels an entry from{' '}
            {formatDate(entry.reverses.postedAt)}, which stays in the history
            marked cancelled.
            {entry.reversalReason && <> Reason given: {entry.reversalReason}</>}{' '}
            <Link
              to="/ledger/$entryId"
              params={{ entryId: entry.reverses.id }}
              className="underline decoration-1 underline-offset-2"
            >
              See the original
            </Link>
            .
          </p>
        )}
      </Band>

      <Band heading="Details" headingId="cf-entry-details">
        <dl className="grid grid-cols-[auto_1fr] gap-x-(--cf-s3) gap-y-(--cf-s1) m-0">
          <dt className="text-ink-quiet">Paid to</dt>
          <dd className="m-0 break-words">{entry.payee}</dd>

          <dt className="text-ink-quiet">Posted</dt>
          <dd className="m-0">{formatDateTime(entry.postedAt)}</dd>

          <dt className="text-ink-quiet">Balance after</dt>
          {/*
           * The server's figure, never re-derived here. A balance
           * recomputed from the rows this device happens to hold is
           * wrong on every short page.
           */}
          <dd className="m-0">
            {/* No `direction`: a balance is a position, not a movement. */}
            <Amount value={entry.balanceAfter} />
          </dd>
        </dl>
      </Band>

      <Band heading="Record" headingId="cf-entry-record">
        <Fingerprint value={entry.fingerprint} sequence={entry.sequence} />
      </Band>

      <FlagHistory entries={log} />
    </>
  )
}
