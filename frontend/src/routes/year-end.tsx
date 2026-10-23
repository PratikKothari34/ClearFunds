import { createFileRoute } from '@tanstack/react-router'
import { Amount } from '../components/Amount'
import { Band } from '../components/Band'
import { isClosed, opinionWords, worstOpinion } from '../lib/opinion'
import { SAMPLE_ADJUSTING, SAMPLE_AUDIT_YEARS } from '../lib/sample'
import type { AuditYear } from '../lib/types'

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
  const years = SAMPLE_AUDIT_YEARS
  const worst = worstOpinion(years)

  return (
    <>
      <Band>
        <h2 className="font-serif text-head font-normal mt-0 mb-(--cf-s1)">
          Financial years
        </h2>
        <p className="m-0 text-ink-quiet max-w-[68ch]">
          A year counts as closed once the society&rsquo;s auditor has signed
          off on it. The committee cannot close a year itself.
        </p>
        {worst && (
          <p className="mt-(--cf-s2) mb-0 max-w-[68ch]">
            The most serious opinion the society has received is{' '}
            <span className="font-medium">{opinionWords(worst)}</span>.
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
        {SAMPLE_ADJUSTING.length === 0 ? (
          <p className="m-0 text-ink-quiet max-w-[68ch]">
            No closed year has needed a correction.
          </p>
        ) : (
          <>
            <p className="m-0 mb-(--cf-s2) text-ink-quiet max-w-[68ch]">
              A closed year cannot be changed. A correction is recorded in the
              current year instead, and each one is read out at the annual
              general meeting.
            </p>
            <ul className="list-none m-0 p-0 flex flex-col gap-(--cf-s2)">
              {SAMPLE_ADJUSTING.map((item) => (
                <li
                  key={item.entryId}
                  className="pl-(--cf-s2) border-l-2 border-attention"
                >
                  <p className="m-0">
                    <Amount value={item.amount} /> — corrects {item.correctsYear}
                  </p>
                  <p className="m-0 text-ink-quiet max-w-[68ch]">
                    {item.reason}
                  </p>
                  <p className="m-0 text-meta text-ink-quiet">
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
        <p className="m-0 text-ink-quiet max-w-[68ch]">
          Still open. The auditor has not signed off on this year.
        </p>
      ) : (
        <>
          <p className="m-0 max-w-[68ch]">
            Closed {formatDate(year.closedAt)}.
          </p>
          {year.opinion && (
            <p className="mt-(--cf-s1) mb-0 max-w-[68ch]">
              The auditor gave {opinionWords(year.opinion)}.
            </p>
          )}
          {year.opinionNote && (
            <p className="mt-(--cf-s1) mb-0 pl-(--cf-s2) border-l-2 border-rule text-ink-quiet max-w-[68ch]">
              {year.opinionNote}
            </p>
          )}
        </>
      )}
    </Band>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
