import { createFileRoute } from '@tanstack/react-router'
import { Amount } from '../components/Amount'
import { Band } from '../components/Band'
import { BandFallback } from '../components/BandFallback'
import {
  isClosed,
  isKnownOpinion,
  opinionWords,
  unrankableYears,
  worstOpinion,
} from '../lib/opinion'
import type { AuditYear } from '../lib/types'
import { formatDate } from '../lib/dates'
import { devAdjusting, devAuditYears } from '../lib/devData'

export const Route = createFileRoute('/year-end')({
  component: YearEnd,
})

/**
 * Financial years, and what the auditor said about each.
 *
 * Wording is fixed by decision and is not loosened anywhere on this
 * page:
 *
 *   - The auditor gives REASONABLE ASSURANCE. Nothing here may say the
 *     auditor certified, verified or confirmed that the accounts are
 *     correct, because that is not what an audit opinion is and
 *     claiming it misleads every resident who reads it.
 *   - "Closed" means an auditor signed off. Not a date, not an admin
 *     action. The committee cannot close its own books, so a year with
 *     no sign-off reads as open however old it is.
 *   - A DISCLAIMER is more serious than an adverse opinion. Any
 *     headline reads the MOST SERIOUS opinion received, never the
 *     "most adverse", which is ambiguous under that ranking.
 *
 * Corrections to a closed year are listed here as well as in the AGM
 * report. Sitting in the current ledger does not discharge the
 * disclosure.
 *
 * The wording and the ranking live in lib/opinion.ts, with tests, so
 * the AGM report view shows the same words and neither copy can drift.
 */
function YearEnd() {
  const years = devAuditYears()
  const adjusting = devAdjusting()

  /*
   * Absent, not empty. Both reads are checked here because the page
   * makes two separate claims from them — the society's worst
   * audit opinion, and whether any closed year has needed a
   * correction. A failed read of either one renders as "no closed year
   * has needed a correction", which is exactly the disclosure the AGM
   * report exists to force into the open.
   */
  if (years === null || adjusting === null) {
    return (
      <BandFallback
        heading="Financial years could not be loaded"
        headingId="cf-yearend-absent"
        explanation="The year-end record did not load. No audit opinion and no corrections are shown, and their absence here is not a statement that there are none. Nothing has been changed."
      />
    )
  }

  const worst = worstOpinion(years)

  /*
   * The opinions the ranking could not read.
   *
   * `worstOpinion` skips what it cannot rank, and it has to — it must
   * still answer for the years it can read. But the skip fails in the
   * dangerous direction: an opinion recorded off-enum is dropped, and a
   * society with a disclaimer on file would show a headline of
   * "unqualified". The best possible answer, derived from the worst
   * possible record.
   *
   * So the page says what it could not read, next to the headline that
   * was computed without it. Naming it is not a nicety: the headline
   * above is wrong whenever this list is non-empty, and a reader has no
   * other way to know that.
   */
  const unreadable = unrankableYears(years)

  return (
    <>
      <Band>
        <h2 className="font-headline-md font-headline-md text-headline-md font-normal mt-0 mb-space-sm">
          Financial years
        </h2>
        <p className="m-0 text-on-surface-variant max-w-[68ch]">
          A year counts as closed once the society&rsquo;s auditor has signed
          off on it. The committee cannot close a year itself.
        </p>
        {worst && (
          <p className="mt-space-md mb-0 max-w-[68ch]">
            The most serious opinion the society has received is{' '}
            <span className="font-medium">{opinionWords(worst)}</span>.
          </p>
        )}
        {unreadable.length > 0 && (
          <p className="mt-space-md mb-0 pl-space-md border-l-2 border-tertiary-fixed max-w-[68ch]">
            {unreadable.length === 1
              ? `The opinion recorded for ${unreadable[0]} is not one this page can read, so it is not counted above.`
              : `The opinions recorded for ${unreadable.join(', ')} are not ones this page can read, so they are not counted above.`}{' '}
            Ask the society for the signed report for{' '}
            {unreadable.length === 1 ? 'that year' : 'those years'}.
          </p>
        )}
      </Band>

      {years.map((year) => (
        <YearRow key={year.year} year={year} />
      ))}

      <Band
        heading="Corrections to years already closed"
        headingId="cf-yearend-adjusting"
      >
        {adjusting.length === 0 ? (
          <p className="m-0 text-on-surface-variant max-w-[68ch]">
            No closed year has needed a correction.
          </p>
        ) : (
          <>
            <p className="m-0 mb-space-md text-on-surface-variant max-w-[68ch]">
              A closed year cannot be changed. A correction is recorded in the
              current year instead, and each one is read out at the annual
              general meeting.
            </p>
            <ul className="list-none m-0 p-0 flex flex-col gap-space-md">
              {adjusting.map((item) => (
                <li
                  key={item.entryId}
                  className="pl-space-md border-l-2 border-tertiary-fixed"
                >
                  <p className="m-0">
                    <Amount amount={item.amount} /> — corrects {item.correctsYear}
                  </p>
                  <p className="m-0 text-on-surface-variant max-w-[68ch]">
                    {item.reason}
                  </p>
                  <p className="m-0 font-label-code-sm text-label-code-sm text-on-surface-variant">
                    Recorded {formatDate(item.postedAt)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Band>
    </>
  )
}

function YearRow({ year }: { readonly year: AuditYear }) {
  return (
    <Band heading={year.year} headingId={`cf-year-${year.year}`}>
      {!isClosed(year) || year.closedAt === undefined ? (
        <p className="m-0 text-on-surface-variant max-w-[68ch]">
          Still open. The auditor has not signed off on this year.
        </p>
      ) : (
        <>
          <p className="m-0 max-w-[68ch]">
            Closed {formatDate(year.closedAt)}.
          </p>
          {/*
            isKnownOpinion first, because `opinionWords` is a switch over
            the four cases with no default: an off-enum value returns
            undefined and this rendered the sentence "The auditor gave ."
            — which reads as a broken page rather than as a record the
            page could not read. The second branch says which of the two
            it is.
          */}
          {/*
            A CLOSE WITH NO OPINION IS DISCLOSED, NOT PASSED OVER.

            This was `year.opinion && (...)`, so a year carrying
            `closedAt` with no `opinion` rendered "Closed 31 March
            2026." and then nothing - and a resident reads that silence
            as a clean year, because a problem would surely have been
            mentioned. It is the quietest possible rendering of the
            most important missing field on the page.

            Closed means an auditor signed off, so the two fields are
            not independent: a close with no opinion is contradictory
            data, and this file already discloses its OTHER gap - an
            opinion off the enum, below - in exactly these terms. The
            inconsistency was the defect, not the missing field.

            `isClosed` tests `closedAt` alone, which is correct for
            deciding whether reversals are blocked. It is not enough to
            claim a verdict exists.
          */}
          {year.opinion === undefined ? (
            <p className="mt-space-sm mb-0 pl-space-md border-l-2 border-tertiary-fixed max-w-[68ch]">
              No audit opinion is recorded against this year, so what the
              auditor concluded is not shown here. This is not a statement
              that the year was found clean. Ask the society for the signed
              report.
            </p>
          ) : isKnownOpinion(year.opinion) ? (
            <p className="mt-space-sm mb-0 max-w-[68ch]">
              The auditor gave {opinionWords(year.opinion)}.
            </p>
          ) : (
            <p className="mt-space-sm mb-0 pl-space-md border-l-2 border-tertiary-fixed max-w-[68ch]">
              An opinion is recorded for this year, but it is not one this
              page can describe. Ask the society for the signed report.
            </p>
          )}
          {year.opinionNote && (
            <p className="mt-space-sm mb-0 pl-space-md border-l-2 border-outline-variant text-on-surface-variant max-w-[68ch]">
              {year.opinionNote}
            </p>
          )}
        </>
      )}
    </Band>
  )
}
