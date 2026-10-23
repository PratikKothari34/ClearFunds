import { Link } from '@tanstack/react-router'
import { Amount } from './Amount'
import type { Entry } from '../lib/types'
import { formatDate } from '../lib/dates'

/**
 * One ledger row — and, when an entry has been reversed, ONE row
 * carrying both the entry and its reversal.
 *
 * This is the most confusable surface in the product for a
 * non-technical resident, and the pairing is why. The two parts are
 * never two rows: the ledger is virtualized, and splitting a reversed
 * pair across a virtualization boundary shows a struck-through amount
 * whose reversal is off-screen. A resident then sees money cancelled
 * with no sign of the cancellation — the worst single rendering failure
 * available here. So the pair is one variable-height item.
 *
 * Accessibility is load-bearing rather than decorative:
 *
 *   - CSS `line-through` is announced by NOTHING. A screen reader user
 *     would hear a cancelled payment read as a live one. So the amount
 *     is wrapped in <s> AND a visually-hidden "cancelled" exists in the
 *     accessibility tree.
 *   - Colour is never the only signal for direction. Amount carries a
 *     sign and an announced word.
 *
 * Type note: Source Sans 3 for both narration and amount, per the type
 * specification. Section 2 of the design says "serif for amounts and
 * narration" where it describes what was inherited from A; the type
 * table that follows assigns Source Serif 4 to band headings only and
 * names Source Sans 3 for both ledger amount and ledger narration. The
 * table is the specification, and tabular figures — which the ledger
 * requires without exception — are the reason.
 */

export function EntryRow({ entry }: { readonly entry: Entry }) {
  const reversed = entry.state === 'reversed'

  return (
    <article
      // Not a <tr>: the pair is one item of variable height, and a
      // table row cannot contain a second row's worth of content
      // without becoming two rows.
      className="flex flex-col gap-(--cf-s1) py-(--cf-s2) border-b border-rule"
      aria-labelledby={`cf-entry-${entry.id}-narration`}
    >
      <div className="flex items-baseline justify-between gap-(--cf-s2)">
        {/*
         * min-w-0 lets the payee wrap. Without it the flex child
         * refuses to shrink and the amount is pushed off a 320px
         * screen.
         */}
        <div className="min-w-0">
          <p
            id={`cf-entry-${entry.id}-narration`}
            className={`m-0 ${reversed ? 'text-ink-quiet' : ''}`}
          >
            {reversed ? (
              <>
                <s>{entry.narration}</s>
                <span className="cf-sr-only"> (cancelled)</span>
              </>
            ) : (
              entry.narration
            )}
          </p>
          <p className="m-0 text-meta text-ink-quiet">
            {/*
             * Payee wraps; the date does not. A wrapped date reads as
             * two separate values.
             */}
            <span className="break-words">{entry.payee}</span>
            {' · '}
            <span className="whitespace-nowrap">
              {formatDate(entry.postedAt)}
            </span>
          </p>
        </div>

        <div className={reversed ? 'text-ink-quiet' : ''}>
          {reversed ? (
            <s>
              <Amount value={entry.amount} direction={entry.direction} />
            </s>
          ) : (
            <Amount value={entry.amount} direction={entry.direction} />
          )}
        </div>
      </div>

      {/*
       * The reversal, inside the same row item. Indented and in --break
       * so the relationship is visible without a connecting line.
       *
       * Gated on `reversed` ALONE, not on `reversed && reversedBy`. The
       * row is already struck through at this point, so gating the whole
       * block on the link meant a reversed entry that arrived without one
       * rendered as cancelled with NO reason and no explanation — the one
       * thing a mandatory-reason rule exists to put on screen. The link
       * and the date are what degrade when `reversedBy` is missing; the
       * reason is not.
       */}
      {reversed && (
        <p className="m-0 pl-(--cf-s2) border-l-2 border-break text-meta text-break max-w-[68ch]">
          {entry.reversedBy
            ? `Cancelled on ${formatDate(entry.reversedBy.postedAt)}`
            : 'Cancelled'}
          {entry.reversalReason && <>: {entry.reversalReason}</>}
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
            </>
          )}
        </p>
      )}

      {/*
       * A reversal itself, pointing back at what it cancels. The
       * original stays visible in the ledger and is marked reversed;
       * nothing is ever edited or deleted.
       */}
      {entry.state === 'reversal' && entry.reverses && (
        <p className="m-0 pl-(--cf-s2) border-l-2 border-rule text-meta text-ink-quiet max-w-[68ch]">
          Corrects an entry from {formatDate(entry.reverses.postedAt)}
          {entry.reversalReason && <>: {entry.reversalReason}</>}
          {' '}
          <Link
            to="/ledger/$entryId"
            params={{ entryId: entry.reverses.id }}
            className="underline decoration-1 underline-offset-2"
          >
            See the original
          </Link>
        </p>
      )}

      {/*
       * Only UNRESOLVED flags are counted here. A resolved flag leaves
       * the count and stays in the entry's append-only log: the log is
       * the record, the count is a to-do list.
       */}
      {entry.openFlagCount > 0 && (
        <p className="m-0 text-meta text-ink-quiet">
          <span className="cf-tabular">{entry.openFlagCount}</span>{' '}
          {entry.openFlagCount === 1 ? 'resident has' : 'residents have'} asked
          about this entry
        </p>
      )}
    </article>
  )
}
