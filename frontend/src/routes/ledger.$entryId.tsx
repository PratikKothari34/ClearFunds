import { Link, createFileRoute } from '@tanstack/react-router'
import { Amount } from '../components/Amount'
import { Band } from '../components/Band'
import { Fingerprint } from '../components/Fingerprint'
import { FlagHistory } from '../components/FlagHistory'
import { formatDate, formatDateTime } from '../lib/dates'
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
  const entry = devLedger().find((e) => e.id === entryId)

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
  const log = devFlagLog()[entry.id] ?? []

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
          {reversed ? (
            <s>
              <Amount value={entry.amount} direction={entry.direction} />
            </s>
          ) : (
            <Amount value={entry.amount} direction={entry.direction} />
          )}
        </p>

        {/*
         * Stated in words, immediately under the amount, because this is
         * the sentence the strike-through was standing in for.
         */}
        {reversed && entry.reversedBy && (
          <p className="mt-(--cf-s2) mb-0 pl-(--cf-s2) border-l-2 border-break text-break max-w-[68ch]">
            This payment was cancelled on{' '}
            {formatDate(entry.reversedBy.postedAt)}. The money does not count
            towards the society balance.
            {entry.reversalReason && <> Reason given: {entry.reversalReason}</>}{' '}
            <Link
              to="/ledger/$entryId"
              params={{ entryId: entry.reversedBy.id }}
              className="underline decoration-1 underline-offset-2"
            >
              See the correction
            </Link>
            .
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
