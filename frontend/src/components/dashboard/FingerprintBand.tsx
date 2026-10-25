import { Link } from '@tanstack/react-router'
import { Band } from '../Band'
import type { AnchorStatus } from '../../lib/types'
import { formatDate } from '../../lib/dates'

/**
 * Band 3. Never collapses — absence would read as a pass.
 *
 * This band is the product's central honesty surface, and almost every
 * way of simplifying it is a lie:
 *
 *   - It reports TWO DATES, not a one-word status. "Verified" is a
 *     claim the frontend cannot make: a hash chain proves no entry
 *     changed, and proves nothing about an entry never served. Only a
 *     comparison against a fingerprint the resident already held
 *     defeats a trimmed chain.
 *   - A FIRST VISIT has nothing to compare against and says so. "No
 *     problems found" on a first visit implies a comparison that did
 *     not happen.
 *   - UNREACHABLE is not a pass and not a failure. The published record
 *     could not be fetched; that is a third state and gets its own
 *     copy.
 *   - A MISMATCH is --break and is about the record, never merged with
 *     anything about the viewer's to-do list. A design that combined
 *     this band with the activity band into one "all good" indicator
 *     would let a quiet to-do list mask a broken chain.
 *
 * WHERE THIS BAND'S BODY NOW ALSO RENDERS (2026-10-25). The provenance
 * lines appear inside the balance block too, via the exported
 * `AnchorBody`, because a resident arrives with ONE question - how much
 * money is there, and can I trust the number - and the design answered
 * it in two sections a scroll apart. The fingerprint was a band you
 * could skip past; attached to the figure it is part of reading the
 * figure.
 *
 * That is NOT the merge the fourth bullet forbids. The forbidden one
 * folds the chain check into a to-do list, where an empty list reads as
 * an all-clear and masks a break. A balance is not a status and makes
 * no claim about the chain, so there is nothing for it to mask.
 *
 * The pairing has its own hazard, and the caller handles it: `mismatch`
 * copy says "do not rely on the figures above", so in the balance block
 * the warning is hoisted ABOVE the figure. A warning printed below the
 * number it invalidates is read second, or not at all.
 *
 * It also never blocks the dashboard. The hero ends when the shell and
 * ledger head are ready; this band carries its own pending state,
 * because blocking the whole app on a cross-origin fetch is the wrong
 * trade.
 */

export function FingerprintBand({
  status,
  pending = false,
  failed = false,
  onRetry,
}: {
  readonly status?: AnchorStatus
  readonly pending?: boolean
  /**
   * This band does NOT get the generic failure fallback, and that is
   * deliberate.
   *
   * For every other band a failed fetch is plumbing. Here it is a
   * domain state the design already named: if the published record
   * cannot be fetched, the check did not run, and `unreachable` says
   * exactly that — "this does not mean anything is wrong with the
   * ledger, and it does not mean it is fine either". A generic
   * "couldn't load this section" would be a weaker, vaguer version of
   * copy that already exists, and it would lose the sentence that
   * stops a resident reading a network failure as a pass.
   *
   * So a failure here renders `unreachable`, preserving whatever this
   * device last compared successfully.
   */
  readonly failed?: boolean
  readonly onRetry?: () => void
}) {
  const shown = resolveShown(status, failed)

  return (
    <Band heading="The published record" headingId="cf-band-fingerprint">
      <div aria-live="polite">
        {!failed && (pending || !status) ? (
          <p className="text-on-surface-variant max-w-[68ch]">
            Checking against the published record…
          </p>
        ) : shown ? (
          <>
            <AnchorBody status={shown} />
            {failed && onRetry && (
              <p className="mt-space-md">
                <button
                  type="button"
                  onClick={onRetry}
                  className="min-h-11 px-space-md border border-outline-variant rounded-sm text-on-surface"
                >
                  Check again
                </button>
              </p>
            )}
          </>
        ) : null}
      </div>
    </Band>
  )
}

/**
 * A fetch failure IS unreachable. The last successful comparison is
 * carried across when we have it, because "last matched 18 Oct" is the
 * most useful thing this band can say when today's check failed.
 *
 * Exported so the balance block resolves identically. A second copy of
 * this logic is how one surface ends up treating a failed fetch as a
 * pass.
 */
export function resolveShown(
  status: AnchorStatus | undefined,
  failed: boolean,
): AnchorStatus | undefined {
  return failed
    ? {
        state: 'unreachable',
        // Carried only when we actually have them. AnchorUnreachable
        // makes these optional precisely so this path does not have to
        // invent a publication date for a record it could not reach.
        ...(status?.lastComparedAt
          ? { lastComparedAt: status.lastComparedAt }
          : {}),
        ...(status?.publishedAt ? { publishedAt: status.publishedAt } : {}),
        ...(status?.publishedSource
          ? { publishedSource: status.publishedSource }
          : {}),
      }
    : status
}

/**
 * The provenance sentences, rendered both in the band above and inside
 * the balance block. ONE copy of this switch, deliberately: two would
 * let one of them drift into saying "verified", the one claim this
 * product may never make.
 *
 * `hideMismatch` is for the balance block, which renders the mismatch
 * warning itself, above the figure. The remaining detail line still
 * prints here so the dates and the "show this to your auditor"
 * instruction are not lost.
 */
export function AnchorBody({
  status,
  hideMismatch = false,
}: {
  readonly status: AnchorStatus
  readonly hideMismatch?: boolean
}) {
  switch (status.state) {
    case 'match':
      return (
        <>
          <p className="max-w-[68ch]">
            Published {formatDate(status.publishedAt)} on{' '}
            {status.publishedSource}
            {status.lastComparedAt && (
              <> — checked on this device {formatDate(status.lastComparedAt)}</>
            )}
            {/*
             * The full stop is glued to the date with no whitespace
             * between the expressions. On its own line JSX collapsed
             * the newline into a space and the sentence rendered
             * "...21 Oct 2026 ." - an orphaned stop on the line every
             * resident with a healthy ledger reads.
             */}
            {'.'}
          </p>
          <p className="font-label-code-sm text-label-code-sm text-on-surface-variant max-w-[68ch] mt-space-sm">
            The history you are reading matches the record published outside
            the committee&rsquo;s control. {VERIFY_HINT}
          </p>
          <VerifyLink />
        </>
      )

    case 'first-visit':
      return (
        <>
          <p className="max-w-[68ch]">
            Published {formatDate(status.publishedAt)} on{' '}
            {status.publishedSource}.
          </p>
          {/*
           * The honest first-visit sentence. A chain cannot prove an
           * entry was never served, so the only thing that defeats a
           * trimmed history is a comparison against a fingerprint the
           * resident already held — and on a first visit there isn't
           * one. Saying "no problems found" here would be the single
           * most misleading sentence available in this product.
           */}
          <p className="font-label-code-sm text-label-code-sm text-on-surface-variant max-w-[68ch] mt-space-sm">
            This is the first time this device has checked, so there is nothing
            earlier to compare against yet. From your next visit, this will
            show whether anything you had already seen has changed.
          </p>
          <VerifyLink />
        </>
      )

    case 'unreachable':
      return (
        <>
          <p className="max-w-[68ch]">
            The published record could not be reached just now.
          </p>
          {/*
           * Not a pass and not a failure. --ink-quiet rather than
           * --break: colouring an unreachable fetch as a mismatch
           * teaches a resident to ignore the colour that matters.
           */}
          <p className="font-label-code-sm text-label-code-sm text-on-surface-variant max-w-[68ch] mt-space-sm">
            This does not mean anything is wrong with the ledger, and it does
            not mean it is fine either — the check simply did not run.
            {status.lastComparedAt && (
              <>
                {' '}
                This device last compared successfully on{' '}
                {formatDate(status.lastComparedAt)}.
              </>
            )}
          </p>
          <VerifyLink />
        </>
      )

    case 'mismatch':
      return (
        <>
          {/*
           * Suppressed only when the CALLER has already rendered this
           * sentence somewhere more useful - above the figure it tells
           * the resident not to rely on. It is never simply dropped.
           */}
          {!hideMismatch && (
            <p className="text-on-error-container max-w-[68ch]">
              <span aria-hidden="true">⚠ </span>
              What this app is showing does not match the published record.
            </p>
          )}
          <p className="font-label-code-sm text-label-code-sm text-on-surface-variant max-w-[68ch] mt-space-sm">
            Published {formatDate(status.publishedAt)} on{' '}
            {status.publishedSource}
            {status.lastComparedAt && (
              <> — this device last matched {formatDate(status.lastComparedAt)}</>
            )}
            . Show this screen to the committee and to your auditor. Do not
            rely on the figures above until it is explained.
          </p>
          <VerifyLink />
        </>
      )
  }
}

const VERIFY_HINT = 'You can check this yourself.'

/**
 * The one route into Verify from the dashboard.
 *
 * Verify is deliberately not a nav item: promoting it to the bar tells
 * every resident on every screen that doubt is a normal state. It is
 * one tap from the thing that would cause the doubt, which is the right
 * distance.
 */
function VerifyLink() {
  return (
    <p className="mt-space-md">
      <Link
        to="/verify"
        className="text-on-primary-fixed-variant underline decoration-1 underline-offset-2 inline-flex items-center min-h-11"
      >
        How to check this yourself
      </Link>
    </p>
  )
}
