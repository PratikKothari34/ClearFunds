import { Link } from '@tanstack/react-router'
import { Band } from '../Band'
import { EntryRow } from '../EntryRow'
import { BandFallback } from '../BandFallback'
import type { Entry } from '../../lib/types'

/**
 * Band 5. The last few entries, never collapsed.
 *
 * With no entries it says "no entries yet" rather than rendering
 * nothing, for the same reason band 2 reserves its slot: a band that
 * disappears moves everything below it and cannot be learned.
 *
 * Uses the same EntryRow as the ledger, so a reversed entry among the
 * recent five renders struck through with its reversal beside it here
 * too. A separate simplified row for the dashboard is how the two
 * surfaces drift until one of them stops showing reversals at all.
 */

export function RecentBand({
  entries,
  failed = false,
  onRetry,
}: {
  readonly entries: readonly Entry[]
  /**
   * Distinct from `entries.length === 0`, and the distinction matters.
   * "No entries yet" is a true statement about a new society; it is a
   * lie about a society whose history failed to load.
   */
  readonly failed?: boolean
  readonly onRetry?: () => void
}) {
  if (failed) {
    return (
      <BandFallback
        heading="Couldn't load recent entries"
        headingId="cf-band-recent"
        explanation="The recent entries did not load. This is not the same as there being none — the full history is still there, and nothing has been removed."
        onRetry={onRetry}
      />
    )
  }

  return (
    <Band heading="Recent" headingId="cf-band-recent">
      {entries.length === 0 ? (
        <p className="text-on-surface-variant max-w-[68ch]">
          No entries yet. The first one will appear here.
        </p>
      ) : (
        <>
          <div>
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </div>
          <p className="mt-space-md">
            <Link
              to="/ledger"
              className="text-on-primary-fixed-variant underline decoration-1 underline-offset-2 inline-flex items-center min-h-11"
            >
              See the full history
            </Link>
          </p>
        </>
      )}
    </Band>
  )
}
