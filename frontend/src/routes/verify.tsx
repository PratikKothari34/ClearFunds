import { createFileRoute } from '@tanstack/react-router'
import { Band } from '../components/Band'
import { comparedAnything, newestEntry } from '../lib/ledger'
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
  const entries = devLedger() ?? []
  const newest = newestEntry(entries)

  /*
   * Whether anything was actually compared, passed to the result
   * alongside the anchor state.
   *
   * The anchor status and the ledger are two INDEPENDENT reads, and
   * nothing but this page couples them. With a `match` anchor and no
   * entries — which is what a production build holds today — the
   * page printed "Newest entry here: None" directly above the match
   * sentence. Zero entries were compared, and the page stated the
   * history matches, on the one surface carrying the product's central
   * claim. (The match sentence has since been weakened from "nothing
   * has been changed" to "no change has been found"; that is a
   * separate fix and does not make this coupling safe.)
   */
  const compared = comparedAnything(entries)

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
        <Result status={status} compared={compared} />
      </Band>

      <Band heading="What this does and does not show" headingId="cf-verify-limits">
        {/*
         * Both halves, always, in this order. Shipping only the first
         * half is the overstatement the decision forbids.
         */}
        <ul className="list-disc pl-(--cf-s3) m-0 max-w-[68ch] flex flex-col gap-(--cf-s1)">
          <li>
            {/*
              "WOULD BE VISIBLE", NEVER "IS NOT POSSIBLE".
              This said "a quiet change to the history is not possible",
              which is a tamper-PROOF claim. Whoever runs the server can
              re-sign a whole chain; what they cannot do is make the
              change agree with a copy published outside their control.
              The product's claim is that a change cannot be made
              QUIETLY - that it becomes visible - and the absolute form
              is the one sentence a reader would be right to call a lie.
            */}
            If any past entry were altered, the references would stop matching,
            and this check would show it. A change to the history cannot be
            made quietly.
          </li>
          <li>
            A match does not mean an entry is correct. It means the entry has
            not changed since it was recorded. Whether the payment was right is
            what the committee, the questions on each entry and the auditor are
            for.
          </li>
          <li>
            {/*
              "SHOWS", NOT "PROVES". The header of this page forbids
              language that leaves a resident believing the check is
              proof, and this bullet - the one about the chain's real
              limit - used the banned word twice.
            */}
            A match cannot show you an expense that was never entered at all.
            The record shows that nothing was changed; it cannot show that
            nothing is missing.
          </li>
        </ul>
      </Band>

      {/*
        THE OFL REQUIRES THE NOTICE TO TRAVEL WITH THE FONTS, and a
        file nothing links to does not travel. `public/fonts/OFL.txt`
        was shipped with no reference anywhere in the app, the HTML or
        either font stylesheet, so a resident served the five .woff2
        files had no way to reach the licence they are served under -
        which is the one thing clause 2 asks for. A CSS comment does
        not discharge it; a comment is not served to a reader.

        Placed on this page rather than in a footer on every screen.
        This is the page about where the record and the app come from,
        so provenance belongs here, and a footer under the balance
        would compete with the one figure most of this product's
        audience opens the app to read.

        A plain anchor, not a Link: the target is a static file in
        `public/`, not a route, and routing it would 404.
      */}
      <Band heading="Licences" headingId="cf-verify-licences">
        <p className="m-0 max-w-[68ch] text-ink-quiet">
          ClearFunds is free software under the GNU General Public License,
          version 3 or later. The typefaces it uses are separate works,
          redistributed unchanged under the{' '}
          <a href="/fonts/OFL.txt" className="underline">
            SIL Open Font License
          </a>
          .
        </p>
      </Band>
    </>
  )
}

function Result({
  status,
  compared,
}: {
  readonly status: AnchorStatus
  /**
   * Whether this device held any entry to compare. False makes every
   * reassuring sentence below unsayable regardless of the anchor
   * state, because a comparison over nothing has no result.
   */
  readonly compared: boolean
}) {
  /*
   * NOTHING COMPARED OUTRANKS EVERY ANCHOR STATE.
   *
   * Checked before the switch, not as a case inside it, because it is
   * true of all four states at once: a `match` over zero entries is
   * not a weaker match, it is not a match at all. Styled as
   * `--ink-quiet` with a plain rule, the same as `first-visit` —
   * this is neither reassurance nor alarm, it is the absence of a
   * result, and colouring it green or amber would make it one.
   */
  if (!compared) {
    return (
      <p className="m-0 max-w-[68ch] pl-(--cf-s2) border-l-2 border-rule text-ink-quiet">
        There is nothing on this device to compare yet, so this check has no
        result. Open the history first; the comparison runs against the
        entries this device holds.
      </p>
    )
  }

  switch (status.state) {
    case 'match':
      return (
        <p className="m-0 max-w-[68ch] pl-(--cf-s2) border-l-2 border-credit">
          {/*
            "NO CHANGE HAS BEEN FOUND", not "nothing has been changed".
            The check compares this device's copy against the published
            one; a match is the absence of a found difference, which is
            not the same as a fact about everything that happened. The
            unqualified form is the strongest sentence in the product
            and the one a lawyer or auditor would quote back.
          */}
          The record on this device matches the published copy. No change to
          the history has been found since it was published.
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
