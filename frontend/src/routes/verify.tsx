import { createFileRoute } from '@tanstack/react-router'
import { Band } from '../components/Band'
import { newestEntry } from '../lib/ledger'
import type { AnchorStatus } from '../lib/types'
import { formatDateTime } from '../lib/dates'
import { devAnchor, devLedger } from '../lib/devData'

export const Route = createFileRoute('/verify')({
  component: Verify,
})

/**
 * Checking the society's record against the published copy.
 *
 * This page carries the product's central claim, so its wording is
 * fixed by decision and not open to tightening:
 *
 *   THE RECORD CANNOT BE CHANGED QUIETLY. Never that it cannot be
 *   forged by whoever runs the server. The page says what the check
 *   does prove and what it does not, because a verification screen
 *   that overstates itself is worse than none — a resident who
 *   believes it is proof stops asking the questions that are the real
 *   safeguard.
 *
 * It is NOT in the navigation for any role. It is reached from the
 * fingerprint band and from an entry's record section, because putting
 * it in the bar tells every resident on every screen that doubt is the
 * normal state.
 *
 * It ALWAYS returns a list, never a bare yes or no. A single word hides
 * which part of the record was compared, and a resident cannot act on
 * "verified".
 */
function Verify() {
  const status: AnchorStatus = devAnchor()
  // The highest sequence, NOT `devLedger()[0]`. Reading position 0 is
  // only correct while the list happens to be sorted newest-first, and
  // this page is the one place where naming the wrong entry as "newest
  // here" misstates what was compared. Same bug class as the sign-off
  // oldest-month read: derive the extreme, never trust the index.
  const newest = newestEntry(devLedger())

  return (
    <>
      <Band>
        <h2 className="font-serif text-head font-normal mt-0 mb-(--cf-s2)">
          Checking this record
        </h2>
        <p className="m-0 max-w-[68ch]">
          The society publishes a short reference for its whole history,
          outside the committee&rsquo;s control. This page compares the record
          on this device against that published copy.
        </p>
      </Band>

      <Band heading="What was compared" headingId="cf-verify-compared">
        <dl className="grid grid-cols-[auto_1fr] gap-x-(--cf-s3) gap-y-(--cf-s1) m-0 max-w-[68ch]">
          <dt className="text-ink-quiet">Published copy</dt>
          {/*
           * Both fields are absent when the published record could not
           * be reached at all, so this row says so rather than
           * rendering "undefined, Invalid Date" — which is what a
           * confident read of these two fields produced before
           * AnchorStatus became a union. On the one page whose job is
           * to show what was compared, "could not be reached" is the
           * answer; a blank or a broken date is not.
           */}
          <dd className="m-0">
            {status.publishedAt && status.publishedSource ? (
              <>
                {status.publishedSource}, {formatDateTime(status.publishedAt)}
              </>
            ) : (
              'Could not be reached, so nothing was compared against it'
            )}
          </dd>

          <dt className="text-ink-quiet">This device last checked</dt>
          <dd className="m-0">
            {status.lastComparedAt
              ? formatDateTime(status.lastComparedAt)
              : 'Not yet — this is the first check on this device'}
          </dd>

          <dt className="text-ink-quiet">Newest entry here</dt>
          <dd className="m-0">
            {newest ? (
              <>
                <span className="cf-tabular">#{newest.sequence}</span>,{' '}
                {formatDateTime(newest.postedAt)}
              </>
            ) : (
              'None'
            )}
          </dd>
        </dl>
      </Band>

      <Band heading="Result" headingId="cf-verify-result">
        <Result status={status} />
      </Band>

      <Band heading="What this does and does not show" headingId="cf-verify-limits">
        {/*
         * Both halves, always, in this order. Shipping only the first
         * half is the overstatement the decision forbids.
         */}
        <ul className="list-disc pl-(--cf-s3) m-0 max-w-[68ch] flex flex-col gap-(--cf-s1)">
          <li>
            If any past entry had been altered, the references would stop
            matching. A quiet change to the history is not possible.
          </li>
          <li>
            A match does not prove an entry is correct. It proves the entry has
            not changed since it was recorded. Whether the payment was right is
            what the committee, the questions on each entry and the auditor are
            for.
          </li>
          <li>
            A match cannot show you an expense that was never entered at all.
            The record proves nothing was changed; it cannot prove nothing is
            missing.
          </li>
        </ul>
      </Band>
    </>
  )
}

function Result({ status }: { readonly status: AnchorStatus }) {
  switch (status.state) {
    case 'match':
      return (
        <p className="m-0 max-w-[68ch] pl-(--cf-s2) border-l-2 border-credit">
          The record on this device matches the published copy. Nothing in the
          history has been changed since it was published.
        </p>
      )

    case 'first-visit':
      // Deliberately not reassuring and deliberately not alarming. There
      // is nothing earlier to compare against, which is a fact about
      // this device, not about the society.
      return (
        <p className="m-0 max-w-[68ch] pl-(--cf-s2) border-l-2 border-rule text-ink-quiet">
          This is the first check on this device, so there is nothing earlier to
          compare against. From now on this page will tell you whether anything
          in the history has changed since your last visit.
        </p>
      )

    case 'unreachable':
      // --ink-quiet, NOT --break. The published copy being unreachable
      // is a network problem; colouring it as a failure teaches
      // residents to read a flaky connection as tampering, and then to
      // ignore the real signal when it appears.
      return (
        <p className="m-0 max-w-[68ch] pl-(--cf-s2) border-l-2 border-rule text-ink-quiet">
          The published copy could not be reached just now, so no comparison
          was made. This usually means a network problem rather than a problem
          with the record. Try again later; the last successful check is shown
          above.
        </p>
      )

    case 'mismatch':
      // The one state that is loud, and the only one that tells the
      // resident to do something outside the app.
      return (
        <div className="max-w-[68ch] pl-(--cf-s2) border-l-2 border-break text-break">
          <p className="m-0 font-medium">
            The record on this device does not match the published copy.
          </p>
          <p className="mt-(--cf-s1) mb-0">
            Something in the history differs from what was published. Show this
            screen to the committee and to the society&rsquo;s auditor, and ask
            for an explanation in writing. Do not rely on the figures in this
            app until that is answered.
          </p>
        </div>
      )
  }
}
