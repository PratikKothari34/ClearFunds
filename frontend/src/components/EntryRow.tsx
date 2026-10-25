import { Amount } from './Amount'
import { Icon } from './Icon'
import { formatPostedAt, type Entry, type Row } from '../lib/ledger'

/*
 * THE LEDGER ROW.
 *
 * The export renders this as a <table> with eight columns. The columns and
 * their order are kept exactly - Date/Entry, Status, Description, Voucher,
 * Approval, Amount, Balance, Action - but they are laid out on a grid
 * instead of table cells, because a reversed entry and its reversal must be
 * ONE item of variable height. A table would have to be fought to let one
 * logical row hold two dated records with their own amounts.
 *
 * The grid template is shared with the header in LedgerList so the two stay
 * aligned, which is the thing a table would have given for free.
 */

export const LEDGER_GRID =
  'grid grid-cols-[7rem_7rem_minmax(12rem,1fr)_8rem_9rem_9rem_9rem_6rem] gap-space-md'

/*
 * Status, said in words a resident reads rather than a token name.
 *
 * `reversed` is deliberately "Cancelled" and not "Reversed": the audience is
 * a non-technical resident, and the vocabulary stays the same everywhere -
 * the entry says cancelled, the amount's hidden text says cancelled.
 */
const STATUS: Record<Entry['status'], { label: string; className: string }> = {
  verified: {
    label: 'Verified',
    /*
     * `secondary-fixed` is theme-invariant (#85f8c4 in both themes), so its
     * partner MUST be the dark `on-secondary-fixed-variant` (#005137) and
     * must not be flipped in dark. Flipping it to match its siblings puts
     * this label at 1.00:1 against its own fill.
     */
    className: 'bg-secondary-fixed/40 text-on-secondary-fixed-variant',
  },
  pending: {
    label: 'Awaiting approval',
    className: 'bg-surface-container-high text-on-surface-variant',
  },
  reversed: {
    label: 'Cancelled',
    className: 'bg-surface-container-high text-on-surface-variant',
  },
  reversal: {
    label: 'Correction',
    className: 'bg-tertiary-fixed/40 text-on-tertiary-fixed-variant',
  },
}

function StatusChip({ status }: { status: Entry['status'] }) {
  const { label, className } = STATUS[status]
  return (
    <span
      className={`inline-flex w-fit items-center rounded px-space-xs py-0.5 font-body-sm text-body-sm font-medium ${className}`}
    >
      {label}
    </span>
  )
}

function PostedAt({ entry }: { entry: Entry }) {
  const when = formatPostedAt(entry.postedAt)
  return (
    <div className="flex flex-col">
      <span className="cf-tabular font-label-code-md text-label-code-md font-semibold text-on-surface">
        #{entry.id}
      </span>
      {when === null ? (
        /* Said plainly rather than printing "Invalid Date" beside money. */
        <span className="font-body-sm text-body-sm italic text-on-surface-variant">
          Date could not be read
        </span>
      ) : (
        <>
          <span className="mt-0.5 font-body-sm text-body-sm text-outline">
            {when.date}
          </span>
          <span className="cf-tabular font-label-code-sm text-label-code-sm text-outline">
            {when.time}
          </span>
        </>
      )}
    </div>
  )
}

function Voucher({ entry }: { entry: Entry }) {
  if (entry.voucher === null) {
    return (
      <span className="font-body-sm text-body-sm text-on-surface-variant">
        No voucher
      </span>
    )
  }
  return (
    <span className="cf-tabular inline-flex w-fit items-center gap-1 rounded bg-surface-container px-space-xs py-1 font-label-code-sm text-label-code-sm text-on-surface">
      {entry.voucher}
    </span>
  )
}

function FlagNote({ count }: { count: number }) {
  if (count <= 0) return null
  /*
   * Only UNRESOLVED flags are counted. A resolved flag leaves this number
   * and stays in the entry's append-only log: the log is the record, the
   * count is a to-do list.
   *
   * A flag has NO financial effect - residents raise disputes, they do not
   * move money - so this never implies the amount is wrong.
   */
  return (
    <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
      <Icon name="audit" className="mr-1 inline size-3.5 align-[-2px]" />
      {count === 1
        ? '1 resident has queried this entry'
        : `${count} residents have queried this entry`}
    </p>
  )
}

/* One ordinary entry: the export's eight columns, in its order. */
function PlainRow({ entry, cancelled }: { entry: Entry; cancelled: boolean }) {
  return (
    <>
      <div><PostedAt entry={entry} /></div>
      <div><StatusChip status={entry.status} /></div>
      <div className="min-w-0">
        <p className="font-body-md text-body-md font-semibold text-on-surface">
          {/*
           * The DESCRIPTION is not struck through, only the amount is.
           *
           * Striking both was the first version and it was removed: a strike
           * on prose conveys nothing to a screen reader, so it could only
           * ever be guarded by asserting that an <s> element exists - a
           * display guard answering an honesty question. Mutation-tested: a
           * mutant that dropped the strike here passed every test, which is
           * the signal that the guard was impossible rather than missing.
           *
           * What a resident actually needs is carried where it survives
           * being read aloud: the amount says "(cancelled)", the status chip
           * says "Cancelled", and the pair's own heading names the
           * relationship.
           */}
          {entry.description}
        </p>
        <p className="font-body-sm text-body-sm text-outline">{entry.counterparty}</p>
        <FlagNote count={entry.openFlags} />
      </div>
      <div><Voucher entry={entry} /></div>
      <div>
        <p className="font-body-sm text-body-sm font-medium text-on-surface">
          {entry.approvalRoute}
        </p>
      </div>
      <div className="text-right">
        <Amount amount={entry.amount} cancelled={cancelled} />
      </div>
      <div className="text-right">
        {/*
         * A cancelled entry has no running balance of its own: it did not
         * change the total. Showing one would invite a resident to subtract
         * it twice. The reversal half of the pair carries the balance.
         */}
        {cancelled ? (
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            No effect on balance
          </span>
        ) : (
          <Amount amount={entry.balanceAfter} />
        )}
      </div>
      <div className="text-center">
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {entry.status === 'pending' ? 'In approval' : 'Recorded'}
        </span>
      </div>
    </>
  )
}

/*
 * A reversed entry WITH its reversal, as one item.
 *
 * This is the most confusable surface in the product for a non-technical
 * resident: the running balance stays consistent while rows are on screen
 * that do not contribute to it. So the item is explicit about all three
 * facts rather than leaving them to be inferred from a strike-through:
 *
 *   - the original is cancelled, in words
 *   - WHY, quoting the mandatory reason
 *   - which entry cancelled it, by number
 *
 * The original is NOT hidden. Omitting it would conceal exactly what the
 * chain exists to prove.
 */
function ReversedPairRow({
  original,
  reversal,
}: {
  original: Entry
  reversal: Entry
}) {
  const reason = reversal.reversalReason?.trim()

  return (
    <div className="flex flex-col gap-space-sm rounded-lg border-l-2 border-outline bg-surface-container-low/60 p-space-sm">
      {/*
       * Announced once, for the whole item, before either half is read out.
       * A screen reader user otherwise meets two amounts with no statement
       * of how they relate.
       */}
      <p className="font-body-sm text-body-sm font-semibold text-on-surface">
        Cancelled entry and its correction
      </p>

      <div className={LEDGER_GRID}>
        <PlainRow entry={original} cancelled />
      </div>

      <div className="flex flex-col gap-space-xs border-t border-outline-variant pt-space-sm">
        <p className="font-body-sm text-body-sm text-on-surface">
          <span className="font-semibold">
            Cancelled by entry #{reversal.id}.
          </span>{' '}
          {reason === undefined || reason.length === 0 ? (
            /*
             * The reason is mandatory, so its absence is a contract breach,
             * not a blank field. Saying so is the honest render; an empty
             * space would read as "no reason needed".
             */
            <span className="italic text-on-surface-variant">
              No reason was recorded, which this ledger requires.
            </span>
          ) : (
            <span className="text-on-surface-variant">{reason}</span>
          )}
        </p>
      </div>

      <div className={LEDGER_GRID}>
        <PlainRow entry={reversal} cancelled={false} />
      </div>
    </div>
  )
}

export function LedgerRow({ row }: { row: Row }) {
  if (row.kind === 'reversedPair') {
    return <ReversedPairRow original={row.original} reversal={row.reversal} />
  }

  const { entry } = row
  /*
   * An entry marked reversed whose reversal is not on this page: struck
   * through, but with no reversal to link. Still shown.
   */
  const stranded = entry.status === 'reversed'

  return (
    <div
      className={`${LEDGER_GRID} items-start border-b border-outline-variant px-space-sm py-space-md`}
    >
      <PlainRow entry={entry} cancelled={stranded} />
    </div>
  )
}
