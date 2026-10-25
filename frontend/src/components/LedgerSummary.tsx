/**
 * The line above every ledger view saying what is on screen and what is
 * not.
 *
 * This exists because of one failure: a resident arrives on a filtered
 * ledger — from a link, from a back button, from a tab they tapped and
 * forgot — and reads a partial record as the whole record. The chain
 * proves nothing was CHANGED; it says nothing about what is missing
 * from the view. So the view says it itself, in plain words, and the
 * excluded count comes from the server rather than from the length of
 * the array we happen to hold.
 *
 * It is announced politely: changing tab changes the count, and a
 * screen reader user who cannot see the table needs that count more
 * than a sighted one, not less.
 */

export function LedgerSummary({
  shown,
  total,
  filterLabel,
}: {
  readonly shown: number
  readonly total: number
  /** Absent on the unfiltered view. */
  readonly filterLabel?: string
}) {
  const hidden = total - shown

  return (
    <p
      className="font-label-code-sm text-label-code-sm text-on-surface-variant py-space-md m-0"
      aria-live="polite"
    >
      {filterLabel === undefined ? (
        <>
          Showing all <span className="cf-tabular">{total}</span>{' '}
          {total === 1 ? 'entry' : 'entries'}.
        </>
      ) : (
        <>
          Showing <span className="cf-tabular">{shown}</span>{' '}
          {shown === 1 ? 'entry' : 'entries'} {filterLabel}.{' '}
          {hidden > 0 ? (
            <>
              <span className="cf-tabular">{hidden}</span> other{' '}
              {hidden === 1 ? 'entry is' : 'entries are'} not shown here.
            </>
          ) : (
            <>Nothing else is hidden.</>
          )}
        </>
      )}
    </p>
  )
}
