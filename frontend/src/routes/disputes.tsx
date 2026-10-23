import { Link, createFileRoute } from '@tanstack/react-router'
import { Band } from '../components/Band'
import { SAMPLE_FLAG_LOG, SAMPLE_LEDGER } from '../lib/sample'

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
  const all = Object.entries(SAMPLE_FLAG_LOG).flatMap(([entryId, items]) =>
    items.map((item) => ({ ...item, entryId })),
  )

  const open = all.filter((i) => !i.resolvedAt)
  const answered = all.filter((i) => i.resolvedAt)

  return (
    <>
      <Band>
        <h2 className="font-serif text-head font-normal mt-0 mb-(--cf-s1)">
          Questions about entries
        </h2>
        <p className="m-0 text-ink-quiet max-w-[68ch]">
          Any resident can ask about any entry. Asking does not change the
          amount — it puts the question on the record until someone answers it.
        </p>
      </Band>

      <Band heading="Not answered yet" headingId="cf-disputes-open">
        {open.length === 0 ? (
          <p className="m-0 text-ink-quiet max-w-[68ch]">
            Every question has been answered.
          </p>
        ) : (
          <ul className="list-none m-0 p-0 flex flex-col gap-(--cf-s3)">
            {open.map((item) => (
              <li
                key={item.id}
                className="pl-(--cf-s2) border-l-2 border-attention"
              >
                <p className="m-0 max-w-[68ch]">{item.question}</p>
                <p className="m-0 text-meta text-ink-quiet">
                  {item.authorHandle ? `${item.authorHandle} · ` : ''}
                  {formatDate(item.raisedAt)}
                  {' · '}
                  <Link
                    to="/ledger/$entryId"
                    params={{ entryId: item.entryId }}
                    className="text-anchor underline decoration-1 underline-offset-2"
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
          <p className="m-0 text-ink-quiet max-w-[68ch]">
            Nothing has been answered yet.
          </p>
        ) : (
          <ul className="list-none m-0 p-0 flex flex-col gap-(--cf-s3)">
            {answered.map((item) => (
              <li key={item.id} className="pl-(--cf-s2) border-l-2 border-rule">
                <p className="m-0 max-w-[68ch]">{item.question}</p>
                {item.answer && (
                  <p className="mt-(--cf-s1) mb-0 text-ink-quiet max-w-[68ch]">
                    {item.answer}
                  </p>
                )}
                <p className="m-0 text-meta text-ink-quiet">
                  Answered {item.resolvedAt ? formatDate(item.resolvedAt) : ''}
                  {' · '}
                  <Link
                    to="/ledger/$entryId"
                    params={{ entryId: item.entryId }}
                    className="text-anchor underline decoration-1 underline-offset-2"
                  >
                    {describeEntry(item.entryId)}
                  </Link>
                </p>
              </li>
            ))}
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
  const entry = SAMPLE_LEDGER.find((e) => e.id === entryId)
  return entry ? entry.narration : `Entry ${entryId}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
