import { Link, createFileRoute } from '@tanstack/react-router'
import { Band } from '../components/Band'
import { BandFallback } from '../components/BandFallback'
import { canSeeFlagAuthor } from '../lib/identity'
import { useViewerRole } from '../lib/viewer'
import { byTimestampAsc, formatDate } from '../lib/dates'
import { devFlagLog, devLedger } from '../lib/devData'
import { isUnresolved, resolvedOn } from '../lib/flags'

export const Route = createFileRoute('/disputes')({
  component: Disputes,
})

/**
 * Questions residents have raised, open and answered.
 *
 * The word on screen is QUESTION, not dispute. A resident asking why a
 * payment was made is doing the thing the product exists to make easy;
 * calling it a dispute makes it adversarial and fewer people do it. The
 * route keeps the name `disputes` because that is the backend's noun.
 *
 * A question has NO FINANCIAL EFFECT. Residents ask; only admins
 * reverse. Nothing on this page offers to change an amount, and the
 * copy says so once, plainly, so a resident is not left expecting the
 * figure to move.
 *
 * Open first, then answered. Answered ones stay — the log is the
 * record, the count is a to-do list.
 */
function Disputes() {
  // Residents are anonymous to each other; the committee sees who asked.
  // Decided once here and passed down, so the two lists below cannot
  // disagree about it.
  const showAuthor = canSeeFlagAuthor(useViewerRole())

  const log = devFlagLog()

  /*
   * Absent, not empty. "Every question has been answered." is a claim
   * about how the committee treats residents who ask — the one
   * thing this surface exists to keep honest. A failed read printing
   * it buries open questions behind a sentence saying there are none.
   */
  if (log === null) {
    return (
      <BandFallback
        heading="Questions could not be loaded"
        headingId="cf-disputes-absent"
        explanation="The questions raised about entries did not load. This does NOT mean every question has been answered — it means the list was not reached. Nothing has been answered or closed."
      />
    )
  }

  const all = Object.entries(log).flatMap(([entryId, items]) =>
    items.map((item) => ({ ...item, entryId })),
  )

  /*
   * OLDEST FIRST on the open list, by parsed timestamp.
   *
   * The unanswered list is a queue, so the question waiting longest
   * belongs at the top — the whole point of showing it is that
   * something has gone unanswered. Unordered, it rendered in whatever
   * order the log's keys happened to iterate.
   *
   * `byTimestampAsc` parses rather than comparing the strings. The
   * fixture is uniformly +05:30 so a string compare passes every test
   * today, and breaks the first time the server emits UTC — an
   * offset difference reorders the queue silently.
   */
  const open = all
    .filter(isUnresolved)
    .sort((a, b) => byTimestampAsc(a.raisedAt, b.raisedAt))
  /*
   * The complement of the SAME predicate, not a second spelling of it.
   * `!i.resolvedAt` here and `== null` in counts.ts disagreed on the
   * empty string, so one question could be counted open in the badge
   * and listed answered on this page at the same time.
   */
  const answered = all.filter((i) => !isUnresolved(i))

  return (
    <>
      <Band>
        <h2 className="font-headline-md font-headline-md text-headline-md font-normal mt-0 mb-space-sm">
          Questions about entries
        </h2>
        <p className="m-0 text-on-surface-variant max-w-[68ch]">
          Any resident can ask about any entry. Asking does not change the
          amount — it puts the question on the record until someone answers it.
        </p>
      </Band>

      <Band heading="Not answered yet" headingId="cf-disputes-open">
        {open.length === 0 ? (
          <p className="m-0 text-on-surface-variant max-w-[68ch]">
            Every question has been answered.
          </p>
        ) : (
          <ul className="list-none m-0 p-0 flex flex-col gap-space-lg">
            {open.map((item) => (
              <li
                key={item.id}
                className="pl-space-md border-l-2 border-tertiary-fixed"
              >
                <p className="m-0 max-w-[68ch]">{item.question}</p>
                <p className="m-0 font-label-code-sm text-label-code-sm text-on-surface-variant">
                  {showAuthor && item.authorHandle
                    ? `${item.authorHandle} · `
                    : ''}
                  {formatDate(item.raisedAt)}
                  {' · '}
                  <Link
                    to="/ledger/$entryId"
                    params={{ entryId: item.entryId }}
                    className="text-on-primary-fixed-variant underline decoration-1 underline-offset-2"
                  >
                    {describeEntry(item.entryId)}
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Band>

      <Band heading="Answered" headingId="cf-disputes-answered">
        {answered.length === 0 ? (
          <p className="m-0 text-on-surface-variant max-w-[68ch]">
            Nothing has been answered yet.
          </p>
        ) : (
          <ul className="list-none m-0 p-0 flex flex-col gap-space-lg">
            {answered.map((item) => {
              // One call, like the other two surfaces. The list is
              // already filtered by the same predicate, so this can
              // only be non-null - but reading the raw field again is
              // how the spellings diverged, so it is not read again.
              const answeredOn = resolvedOn(item)
              return (
              <li key={item.id} className="pl-space-md border-l-2 border-outline-variant">
                <p className="m-0 max-w-[68ch]">{item.question}</p>
                {item.answer && (
                  <p className="mt-space-sm mb-0 text-on-surface-variant max-w-[68ch]">
                    {item.answer}
                  </p>
                )}
                <p className="m-0 font-label-code-sm text-label-code-sm text-on-surface-variant">
                  {/*
                   * No `: ''` fallback. "Answered" with nothing after
                   * it is a sentence saying a question was dealt with
                   * on no date; if the timestamp is unusable the
                   * question is not answered, which is what the
                   * predicate above already decided.
                   */}
                  {answeredOn !== null
                    ? `Answered ${formatDate(answeredOn)}`
                    : 'Answered'}
                  {' · '}
                  <Link
                    to="/ledger/$entryId"
                    params={{ entryId: item.entryId }}
                    className="text-on-primary-fixed-variant underline decoration-1 underline-offset-2"
                  >
                    {describeEntry(item.entryId)}
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

/**
 * A readable label for the entry a question is about. Falls back to the
 * reference rather than rendering nothing: a link with no text is
 * unusable, and an entry can legitimately be missing from the page of
 * rows this device happens to hold.
 */
function describeEntry(entryId: string): string {
  // Null ledger falls through to the reference label, which is the
  // honest answer: the narration was not fetched, so it is not known.
  const entry = devLedger()?.find((e) => e.id === entryId)
  return entry ? entry.narration : `Entry ${entryId}`
}
