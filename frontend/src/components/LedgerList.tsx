import type { ReactNode } from 'react'
import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { LEDGER_GRID, LedgerRow } from './EntryRow'
import { complaints, pair, type Entry } from '../lib/ledger'

/*
 * TANSTACK VIRTUAL, NOT TANSTACK TABLE.
 *
 * The ledger is not a grid. A reversed entry and its reversal render as one
 * VARIABLE-HEIGHT item, never two rows, and that is a virtualizer's job - a
 * table would have to be fought to do it.
 *
 * Height is measured rather than estimated because the heights genuinely
 * differ: a plain entry, an entry carrying a resident query, and a reversed
 * pair holding two dated records plus a quoted reason are three different
 * sizes. A fixed estimate would clip the reason, which is mandatory text.
 */

const HEADERS = [
  'Date / Entry',
  'Status',
  'Description',
  'Voucher',
  'Approval',
  'Amount',
  'Balance',
  'Action',
] as const

export interface LedgerListProps {
  entries: readonly Entry[]
  /*
   * What to say when there is nothing to show.
   *
   * ONLY THE CALLER KNOWS WHICH EMPTY THIS IS. "No entries yet" is a claim
   * about the society - that no money has ever moved - and it is false on a
   * filtered tab or a search that matched nothing, where the right sentence
   * is that nothing MATCHED. `search.ts` rule 3 states the distinction; this
   * prop is how the caller makes it, because the component is handed the
   * filtered list and cannot tell the two apart.
   *
   * Omitted means the unfiltered ledger, so the default is the
   * no-data sentence.
   */
  emptyMessage?: ReactNode
}

export function LedgerList({ entries, emptyMessage }: LedgerListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rows = pair(entries)
  const found = complaints(entries)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    /* A plain row's height; every item is then measured for real. */
    estimateSize: () => 96,
    overscan: 6,
  })

  if (rows.length === 0) {
    /* An empty screen states what to do, rather than just being blank. */
    return (
      <div className="rounded-xl bg-surface-container-lowest p-space-lg text-center shadow-sm">
        {emptyMessage !== undefined ? (
          <p className="font-body-md text-body-md text-on-surface">
            {emptyMessage}
          </p>
        ) : (
          <>
            <p className="font-body-md text-body-md text-on-surface">
              No entries yet.
            </p>
            <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
              Once the committee records its first entry, it appears here and
              cannot be edited or removed.
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <section className="flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
      {found.length > 0 && (
        /*
         * The chain that arrived breaks a rule the server is supposed to
         * enforce. Say so instead of rendering a plausible ledger on top of
         * it - a resident cannot tell a contract breach from a correct
         * ledger, and this is the one place that can.
         */
        <div className="border-b border-outline-variant bg-error-container/30 p-space-md">
          <p className="font-body-md text-body-md font-semibold text-on-error-container">
            This history does not follow the ledger&apos;s own rules.
          </p>
          <ul className="mt-space-xs flex flex-col gap-space-xs">
            {found.map((c) => (
              <li
                key={`${c.entryId}-${c.problem}`}
                className="font-body-sm text-body-sm text-on-surface"
              >
                Entry #{c.entryId}: {c.problem}.
              </li>
            ))}
          </ul>
          <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
            Report this to the committee. The entries below are shown exactly
            as received.
          </p>
        </div>
      )}

      {/* The export's header row, same columns in the same order. */}
      <div
        className={`${LEDGER_GRID} border-b border-outline-variant bg-surface-container-low px-space-sm py-space-md font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline`}
        aria-hidden="true"
      >
        {HEADERS.map((h) => (
          <div
            key={h}
            className={
              h === 'Amount' || h === 'Balance'
                ? 'text-right'
                : h === 'Action'
                  ? 'text-center'
                  : ''
            }
          >
            {h}
          </div>
        ))}
      </div>

      {/*
       * The scrollbar is deliberately NOT hidden. The export sets
       * `::-webkit-scrollbar { display: none }`; on a long ledger the
       * scrollbar is the only signal of how much history exists, so hiding
       * it loses information a resident uses.
       */}
      <div
        ref={scrollRef}
        className="max-h-[70vh] overflow-y-auto overflow-x-auto"
        /*
         * A list, not a table, because an item can contain two records.
         * Named so a screen reader user knows what they have landed in.
         */
        role="list"
        aria-label="Ledger entries, newest first"
      >
        <div
          style={{ height: `${virtualizer.getTotalSize()}px` }}
          className="relative w-full"
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]
            if (row === undefined) return null
            const key =
              row.kind === 'reversedPair'
                ? `pair-${row.reversal.id}`
                : `entry-${row.entry.id}`
            return (
              <div
                key={key}
                role="listitem"
                /* Measured, not estimated - see the header comment. */
                ref={virtualizer.measureElement}
                data-index={item.index}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <LedgerRow row={row} />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
