import { Link, createFileRoute } from '@tanstack/react-router'
import { Amount } from '../components/Amount'
import { Band } from '../components/Band'
import { PendingAction } from '../components/PendingAction'
import { BandFallback } from '../components/BandFallback'
import { formatMoney } from '../lib/money'
import { isShowableCount, isUnreadableCount } from '../lib/countable'
import {
  hasUnplaceablePeriods,
  oldestUnsigned,
  waitingBehind,
} from '../lib/signoff'
import type { SignoffPeriod } from '../lib/types'
import { devSignoff } from '../lib/devData'

export const Route = createFileRoute('/sign-off')({
  component: SignOff,
})

/**
 * The president's monthly sign-off on the expense sheet.
 *
 * ONE PERIOD AT A TIME, always the oldest unsigned one. A list of
 * months to sign invites signing the convenient one and leaving a gap,
 * and a gap in monthly sign-off is exactly what this surface exists to
 * prevent.
 *
 * Everything that should give the president pause is shown BEFORE the
 * button, never behind a link: unanswered questions, and payments to
 * one payee that individually stayed under the limit but together
 * crossed it. Structuring is made visible rather than blocked —
 * blocking teaches splitting across payees, which is harder to see.
 *
 * Signing off is not closing the year. Only an auditor closes a
 * financial year; this is the committee confirming a month's sheet.
 */
function SignOff() {
  /*
   * The oldest unsigned period, not a list — and chosen by id rather
   * than by trusting array order.
   *
   * Taking [0] assumed the server sends these oldest-first. That
   * assumption is invisible when it holds and silent when it breaks:
   * a payload ordered newest-first would put the president on the
   * wrong month, with the right heading above it, and nothing on the
   * screen would look wrong. The id is `s-YYYY-MM`, so it sorts
   * lexicographically in calendar order.
   */
  const periods = devSignoff()

  /*
   * ABSENT IS NOT EMPTY, and here the empty copy is the sharpest false
   * statement in the product: "Every month up to now has been signed
   * off." is a compliance claim, read by a president deciding whether
   * anything needs their signature. A failed read produced it
   * verbatim, so an unsigned month would be invisible while the page
   * said the books were current.
   */
  if (periods === null) {
    return (
      <BandFallback
        heading="Sign-off could not be loaded"
        headingId="cf-signoff-absent"
        explanation="The months waiting for sign-off did not load. This does NOT mean every month has been signed off — it means the list was not reached. Nothing has been signed."
      />
    )
  }

  const period = oldestUnsigned(periods)

  /*
   * UNUSABLE IS NOT EMPTY EITHER, and this is the second half of the
   * guard above rather than a new rule.
   *
   * `oldestUnsigned` rejects a period whose id it cannot place in the
   * calendar, so a list where every id is malformed arrives here
   * looking exactly like a list where nothing is waiting - and fell
   * through to "Every month up to now has been signed off.", the
   * compliance claim this page exists to keep honest. Months WERE
   * listed; none of them could be read.
   *
   * It is checked before the all-clear and not merged into it, because
   * the two have opposite meanings for the president: one says their
   * signature is not needed, the other says we cannot tell.
   */
  if (hasUnplaceablePeriods(periods)) {
    return (
      <BandFallback
        heading="Sign-off could not be read"
        headingId="cf-signoff-unusable"
        explanation="Months are listed as waiting for sign-off, but none of them could be read. This does NOT mean every month has been signed off. Nothing has been signed."
      />
    )
  }

  if (!period) {
    return (
      <Band>
        <h2 className="font-serif text-head font-normal mt-0 mb-(--cf-s1)">
          Nothing to sign
        </h2>
        <p className="m-0 text-ink-quiet max-w-[68ch]">
          Every month up to now has been signed off.
        </p>
      </Band>
    )
  }

  return <PeriodSignoff period={period} waiting={waitingBehind(periods)} />
}

function PeriodSignoff({
  period,
  waiting,
}: {
  readonly period: SignoffPeriod
  /** Unsigned months behind this one. Disclosed, never listed as peers. */
  readonly waiting: number
}) {
  /*
   * AN UNREADABLE QUESTION COUNT BLOCKS, it does not clear.
   *
   * This was `period.openFlagCount > 0`, and `NaN > 0` is false - so a
   * month whose question count arrived malformed told the president
   * "Your sign-off is recorded in the history" with no mention of
   * anything outstanding, AND suppressed the "Questions not yet
   * answered" band that would have contradicted it. They would put
   * their name to a month believing it clean, on the strength of a
   * number nobody could read.
   *
   * Every other count in this product fails silent, because a display
   * that cannot show a figure should not invent one. This one is a
   * decision rather than a display, so it fails loud.
   */
  const flagsUnreadable = isUnreadableCount(period.openFlagCount)
  const blocked =
    flagsUnreadable ||
    isShowableCount(period.openFlagCount) ||
    period.structuring.length > 0

  return (
    <>
      <Band>
        <p className="m-0 text-meta text-ink-quiet">Oldest month not signed</p>
        <h2 className="font-serif text-head font-normal mt-(--cf-s1) mb-(--cf-s2)">
          {period.label}
        </h2>

        <dl className="grid grid-cols-[auto_1fr] gap-x-(--cf-s3) gap-y-(--cf-s1) m-0">
          <dt className="text-ink-quiet">Money in</dt>
          <dd className="m-0">
            <Amount value={period.inflow} direction="in" />
          </dd>

          <dt className="text-ink-quiet">Money out</dt>
          <dd className="m-0">
            <Amount value={period.outflow} direction="out" />
          </dd>

          <dt className="text-ink-quiet">Entries</dt>
          {/*
           * GUARDED WITH `isUnreadableCount`, NOT `isShowableCount`.
           *
           * Printed bare, this rendered the literal "NaN" beside the
           * sign-off action while every figure around it was guarded -
           * on the one screen where a president commits to a month.
           *
           * The guard has to be the unreadable one: zero entries in a
           * month is legitimate here (a quiet month is still a month
           * to sign), so `isShowableCount` - which is false for zero -
           * would hide a true figure.
           */}
          <dd className="m-0 cf-tabular">
            {isUnreadableCount(period.entryCount) ? (
              <span className="text-break">Could not be read</span>
            ) : (
              period.entryCount
            )}
          </dd>
        </dl>

        {/*
         * Months behind this one are DISCLOSED, not listed.
         *
         * A president three months behind must know the backlog exists
         * — otherwise signing this month looks like finishing. But
         * rendering the other months as siblings, each with their own
         * button, is what invites signing the convenient one and
         * leaving a gap. So: a count and a plain sentence, no links to
         * jump ahead. The next month appears here once this one is
         * signed.
         */}
        {waiting > 0 && (
          <p className="mt-(--cf-s3) mb-0 text-meta text-ink-quiet max-w-[68ch]">
            <span className="cf-tabular">{waiting}</span> later{' '}
            {waiting === 1 ? 'month is' : 'months are'} also waiting. They
            become available in order, oldest first, as you sign.
          </p>
        )}
      </Band>

      {/*
       * Unanswered questions first. The president is being asked to put
       * their name to a month; an open question is the single most
       * relevant fact about it.
       */}
      {(isShowableCount(period.openFlagCount) || flagsUnreadable) && (
        <Band heading="Questions not yet answered" headingId="cf-signoff-flags">
          {/*
            COUNTS QUESTIONS, NOT ENTRIES. `openFlagCount` is the number
            of unresolved flags in the period, and two residents can ask
            about the same entry. "3 entries have a question" was a
            sentence the number does not support: it would report three
            entries where one entry had three questions, and the
            president is signing on the strength of it.

            The entry count is not derivable from here either — that
            needs a distinct-entry figure from the server, which is not
            in the payload. So the copy says the thing the number IS.
          */}
          <p className="m-0 max-w-[68ch] pl-(--cf-s2) border-l-2 border-attention">
            {/*
              THE FIGURE DEGRADES, THE WARNING DOES NOT. A count nobody
              can read is not a reason to stop telling the president
              that questions may be outstanding - it is the reason to
              tell them, because this is the screen where they put
              their name to the month. No number is invented: the
              sentence says the count could not be read, which is the
              only honest thing it can say.
            */}
            {flagsUnreadable ? (
              <>
                How many questions residents have asked about this month could
                not be read. Treat the month as having questions outstanding
                until you have looked.{' '}
              </>
            ) : (
              <>
                <span className="cf-tabular">{period.openFlagCount}</span>{' '}
                {period.openFlagCount === 1 ? 'question' : 'questions'} from
                residents {period.openFlagCount === 1 ? 'has' : 'have'} not been
                answered yet.{' '}
              </>
            )}
            <Link
              to="/ledger/flagged"
              className="text-anchor underline decoration-1 underline-offset-2"
            >
              Read them
            </Link>
            .
          </p>
        </Band>
      )}

      {period.structuring.length > 0 && (
        <Band
          heading="Payments worth looking at together"
          headingId="cf-signoff-structuring"
        >
          <p className="m-0 mb-(--cf-s2) text-ink-quiet max-w-[68ch]">
            These were each small enough to be approved by the treasurer and
            secretary, but together they come to more than the
            society&rsquo;s limit. That is not wrong by itself — it is worth
            reading before you sign.
          </p>
          <ul className="list-none m-0 p-0 flex flex-col gap-(--cf-s2)">
            {period.structuring.map((group) => (
              <li
                key={group.payee}
                className="pl-(--cf-s2) border-l-2 border-attention"
              >
                <p className="m-0">
                  {group.payee} — {formatMoney(group.total)} across{' '}
                  <span className="cf-tabular">{group.entryIds.length}</span>{' '}
                  payments
                </p>
                <p className="m-0 text-meta text-ink-quiet">
                  Within <span className="cf-tabular">{group.windowDays}</span>{' '}
                  days
                </p>
              </li>
            ))}
          </ul>
        </Band>
      )}

      <Band>
        {/*
         * The button is never disabled by open questions. The president
         * has the last say and may sign with a question outstanding;
         * what the product owes them is that they saw it first. A
         * disabled button would move the decision to whoever answers
         * the question, which is not where the bye-laws put it.
         */}
        <PendingAction>Sign off {period.label}</PendingAction>
        <p className="mt-(--cf-s2) mb-0 text-meta text-ink-quiet max-w-[68ch]">
          {blocked
            ? 'When signing works, you will be able to sign with a question outstanding: the sign-off is recorded with the date, and so is the question.'
            : 'When signing works, your sign-off will be recorded in the history with the date. It cannot be removed, only corrected by a later entry.'}
        </p>
      </Band>
    </>
  )
}
