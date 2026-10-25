import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { EntryRow } from './EntryRow'
import type { Entry } from '../lib/types'

/**
 * The ledger, virtualized.
 *
 * Two things here are requirements rather than implementation choices.
 *
 * ONE ITEM PER ENTRY, NOT PER LINE. A reversed entry and its reversal
 * render inside a single EntryRow, so the virtualizer measures one
 * variable-height item. Were the pair two items, the virtualizer could
 * mount the struck-through amount and leave the reversal below the
 * window: a resident would see money cancelled with nothing saying why.
 *
 * MEASURED, NOT ESTIMATED. `estimateSize` is a first guess only;
 * `measureElement` replaces it with the real height once an item
 * mounts. Heights genuinely vary — a reversal reason is free text, a
 * payee wraps at 320px, a flag count adds a line — so a fixed row
 * height would overlap rows or leave gaps exactly on the rows that
 * matter most.
 *
 * The scroll container is the window, not an inner div. An inner
 * scroller on a phone fights the page scroll and traps the browser's
 * own overscroll gestures.
 *
 * `oxlint` warns `react(incompatible-library)` against useVirtualizer,
 * because it returns functions that React Compiler cannot safely
 * memoize. The warning is accepted, not worked around: the compiler is
 * not enabled on this project, and when it is, skipping memoization of
 * this one component is the correct outcome — the virtualizer's whole
 * job is to recompute on scroll. Do NOT "fix" this by wrapping
 * measureElement in useCallback: the function identity is what feeds
 * fresh measurements back, and a stale one silently freezes row
 * heights at their estimate, which is the bug this component exists to
 * avoid.
 */

/** A generous first guess. Measurement corrects it on mount. */
const ESTIMATED_ROW_HEIGHT = 96

/**
 * Below this, virtualization costs more than it saves: the measurement
 * pass and the absolute positioning buy nothing on a list that fits in
 * two screens, and plain DOM keeps find-in-page working.
 */
export const VIRTUALIZE_THRESHOLD = 40

export function LedgerList({
  entries,
  emptyMessage = 'No entries yet. The first one will appear here.',
}: {
  readonly entries: readonly Entry[]
  readonly emptyMessage?: string
}) {
  if (entries.length === 0) {
    return (
      <p className="text-on-surface-variant max-w-[68ch] py-space-xl">{emptyMessage}</p>
    )
  }

  if (entries.length < VIRTUALIZE_THRESHOLD) {
    return <PlainList entries={entries} />
  }

  return <VirtualList entries={entries} />
}

function PlainList({ entries }: { readonly entries: readonly Entry[] }) {
  /*
   * A LIST, SO A SCREEN READER CAN SAY HOW LONG IT IS.
   *
   * Both paths were a bare `div` of rows, which announces neither
   * "list of 40" nor "item 3 of 40". That matters more here than on an
   * ordinary list: this is a financial history, and a resident who
   * cannot tell whether they have reached the end cannot tell a short
   * ledger from one that stopped loading.
   *
   * `role` rather than `<ul>` because `EntryRow` renders an
   * `<article>`, and an `<li>` wrapper around it would add a node per
   * row for no gain. The virtual path cannot use `<ul>` at all - its
   * children are absolutely positioned - so both paths use the role
   * and stay the same shape.
   */
  return (
    <div role="list" aria-label={`${entries.length} entries, newest first`}>
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          role="listitem"
          aria-setsize={entries.length}
          aria-posinset={index + 1}
        >
          <EntryRow entry={entry} />
        </div>
      ))}
    </div>
  )
}

function VirtualList({ entries }: { readonly entries: readonly Entry[] }) {
  // The list's offset from the top of the document, so window-scroll
  // virtualization knows where the list starts.
  const listRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: entries.length,
    // Window scrolling: the page scrolls, not a nested div.
    getScrollElement: () => (typeof window === 'undefined' ? null : document.documentElement),
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    // Keeps a few rows mounted past the viewport so a fast flick does
    // not show blank space, and so find-in-page has something to hit
    // just off-screen.
    overscan: 8,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  })

  const items = virtualizer.getVirtualItems()

  return (
    <div
      ref={listRef}
      role="list"
      /*
       * THE TOTAL IS DECLARED, because the rows cannot carry it.
       *
       * Only the rows near the viewport are mounted, so the
       * accessibility tree holds about a dozen of them whatever the
       * ledger's length - a screen reader counting children would
       * report "12 items" for 400 entries. `aria-setsize` on each row
       * states the real total, and `aria-posinset` states where the
       * mounted row actually sits, which is the documented remedy for
       * a virtualized list and the only way the two agree.
       */
      aria-label={`${entries.length} entries, newest first`}
      style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
    >
      {items.map((item) => {
        const entry = entries[item.index]
        if (!entry) return null
        return (
          <div
            key={entry.id}
            role="listitem"
            aria-setsize={entries.length}
            aria-posinset={item.index + 1}
            // measureElement reads this node's real height and feeds it
            // back, which is what makes a variable-height reversed pair
            // position correctly.
            ref={virtualizer.measureElement}
            data-index={item.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            <EntryRow entry={entry} />
          </div>
        )
      })}
    </div>
  )
}
