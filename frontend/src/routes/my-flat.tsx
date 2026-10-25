import { Link, createFileRoute } from '@tanstack/react-router'
import { Amount } from '../components/Amount'
import { isOutstanding, isUnreadableAmount } from '../lib/countable'
import { Band } from '../components/Band'
import { BandFallback } from '../components/BandFallback'
import { duesVisibilitySentence, isFromFlat } from '../lib/identity'
import { useViewerFlat } from '../lib/viewer'
import { formatDate } from '../lib/dates'
import { devDues, devFlagLog } from '../lib/devData'
import { resolvedOn } from '../lib/flags'

export const Route = createFileRoute('/my-flat')({
  component: MyFlat,
})

/**
 * A resident's own flat: what they owe, and what they have asked.
 *
 * Their own position only. The by-flat dues table is a treasurer
 * surface and is not part of a resident payload — a resident cannot see
 * what a neighbour owes, and that is a payload boundary rather than a
 * rendering one.
 *
 * A tenant gets a sub-account under the owner, so the owner can see
 * what was raised from their flat. The questions listed here are the
 * flat's, not one person's, which is why the copy says "from this flat".
 */
function MyFlat() {
  /*
   * Looked up BY FLAT NUMBER, never by array index.
   *
   * This was `devDues()[1]`, a fixed position in a list, which showed
   * whichever flat happened to sit second rather than the one the
   * session belongs to. So the page rendered a neighbour's billed,
   * paid and outstanding amounts under the heading "Your flat", above
   * the line "Other residents cannot see this." — the exact disclosure
   * the page exists to rule out, stated and broken in the same band.
   *
   * The flat numbers are deliberately not named here. An earlier
   * version of this comment named them, the placeholder moved, and the
   * comment then described a mismatch that no longer existed while
   * reading as a precise account of one.
   *
   * An index also cannot fail honestly: it returns SOMEBODY for any
   * list long enough, so there is no mismatch to notice. A lookup
   * returns undefined and falls into the "no flat is linked" band
   * below, which is the truthful answer when the two do not agree.
   *
   * At cutover the constant is replaced by the session's own flat and
   * this lookup is what the server's row is matched against, so the
   * shape stays.
   */
  const myFlat = useViewerFlat()
  const dues = devDues()
  const log = devFlagLog()

  /*
   * Absent, and it must not collapse into "no flat is linked".
   *
   * Both reads are checked, because the band below says the account
   * has no flat attached to it — an administrative fact a resident
   * would act on by calling the society office. A failed read saying
   * it sends them to argue about their own records.
   */
  if (dues === null || log === null) {
    return (
      <BandFallback
        heading="Your flat could not be loaded"
        headingId="cf-myflat-absent"
        explanation="Your flat’s position did not load. This is not a statement about what you owe, and it does not mean no flat is linked to your account. Nothing has been changed."
      />
    )
  }

  /*
   * THE SESSION'S FLAT, never a module constant.
   *
   * This read `PLACEHOLDER_FLAT` directly, which cannot be wrong about
   * the ROLE because it never asked - it was wrong about the IDENTITY,
   * the same class as the `devDues()[1]` bug below. Centralising the
   * constant fixed the mismatch between two placeholders; it did not
   * connect this page to the session, so the page had no slot for the
   * session to go into and whoever did the cutover would have had to
   * invent one.
   *
   * The flat is absent for every non-resident role by
   * construction, so an auditor or a treasurer typing this URL falls
   * through to the "no flat is linked" band rather than rendering some
   * resident's arrears under the heading "Your flat".
   */
  const flat = myFlat ? dues.find((r) => r.flat === myFlat) : undefined
  // isFromFlat, not `.includes(flat)`: a substring test matches 'B-40'
  // against 'B-402' and would show this resident another flat's
  // questions, on the page that promises the opposite.
  const mine = Object.entries(log).flatMap(([entryId, items]) =>
    items
      .filter((item) => isFromFlat(item.authorHandle, flat?.flat))
      .map((item) => ({ ...item, entryId })),
  )

  if (!flat) {
    return (
      <Band>
        <p className="m-0 text-ink-quiet max-w-[68ch]">
          No flat is linked to this account yet. Ask the society office to link
          it.
        </p>
      </Band>
    )
  }

  return (
    <>
      <Band>
        <p className="m-0 text-meta text-ink-quiet">Your flat</p>
        <h2 className="font-serif text-head font-normal mt-(--cf-s1) mb-0 cf-tabular">
          {flat.flat}
        </h2>
      </Band>

      <Band heading="Maintenance" headingId="cf-myflat-dues">
        <dl className="grid grid-cols-[auto_1fr] gap-x-(--cf-s3) gap-y-(--cf-s1) m-0">
          <dt className="text-ink-quiet">Billed</dt>
          <dd className="m-0">
            <Amount value={flat.billed} />
          </dd>

          <dt className="text-ink-quiet">Paid</dt>
          <dd className="m-0">
            <Amount value={flat.paid} />
          </dd>

          <dt className="text-ink-quiet">Outstanding</dt>
          <dd className="m-0">
            {/*
             * THREE WAYS, and the unreadable case shows no figure.
             *
             * Both branches used to render `Amount`, so an unreadable
             * `minor` printed junk where this resident's own arrears
             * belong - the single figure on this page they came to
             * read, and one they may act on by paying. A wrong amount
             * here is worse than no amount.
             */}
            {isUnreadableAmount(flat.outstanding) ? (
              <span className="text-break">
                Could not be read. Ask the treasurer before paying.
              </span>
            ) : isOutstanding(flat.outstanding) ? (
              <span className="text-attention">
                <Amount value={flat.outstanding} />
              </span>
            ) : (
              <Amount value={flat.outstanding} />
            )}
          </dd>
        </dl>

        {/*
          GENERATED FROM THE PREDICATE, not typed beside it.

          This said "the society's committee can", which is wider than
          the code allows: `committee` is its own role and
          `canSeeAllDues` refuses it, so the page told a resident that
          thirteen committee members read their arrears when three
          office-bearers do. Overstating who sees this figure is the
          costly direction — what a flat owes is the most socially
          loaded number in the product, and a resident who believes the
          whole committee reads it behaves as though they do.

          `/dues` makes the same promise from the same function, so the
          two pages cannot drift apart again.
        */}
        <p className="mt-(--cf-s2) mb-0 text-meta text-ink-quiet max-w-[68ch]">
          As of {formatDate(flat.asOf)}. Other residents cannot see this. Of
          the society&rsquo;s office-bearers, {duesVisibilitySentence()} can.
        </p>
      </Band>

      <Band heading="Questions from this flat" headingId="cf-myflat-questions">
        {mine.length === 0 ? (
          <p className="m-0 text-ink-quiet max-w-[68ch]">
            You have not asked about any entry yet. Open any entry in the
            history to ask about it.
          </p>
        ) : (
          <ul className="list-none m-0 p-0 flex flex-col gap-(--cf-s3)">
            {mine.map((item) => {
              // Resolved once into a local: see FlagHistory for why a
              // second call plus a cast is the thing to avoid.
              const answeredOn = resolvedOn(item)
              return (
              <li
                key={item.id}
                className={`pl-(--cf-s2) border-l-2 ${
                  answeredOn === null ? 'border-attention' : 'border-rule'
                }`}
              >
                <p className="m-0 max-w-[68ch]">{item.question}</p>
                {item.answer && (
                  <p className="mt-(--cf-s1) mb-0 text-ink-quiet max-w-[68ch]">
                    {item.answer}
                  </p>
                )}
                <p className="m-0 text-meta text-ink-quiet">
                  {answeredOn !== null
                    ? `Answered ${formatDate(answeredOn)}`
                    : 'Not answered yet'}
                  {' · '}
                  <Link
                    to="/ledger/$entryId"
                    params={{ entryId: item.entryId }}
                    className="text-anchor underline decoration-1 underline-offset-2"
                  >
                    See the entry
                  </Link>
                </p>
              </li>
              )
            })}
          </ul>
        )}
      </Band>
    </>
  )
}
