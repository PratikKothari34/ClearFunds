import { Link, createFileRoute } from '@tanstack/react-router'
import { Amount } from '../components/Amount'
import { Band } from '../components/Band'
import { SAMPLE_DUES, SAMPLE_FLAG_LOG } from '../lib/sample'

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
  // Standing in for the viewer's own flat until auth exists.
  const flat = SAMPLE_DUES[1]
  const mine = Object.entries(SAMPLE_FLAG_LOG).flatMap(([entryId, items]) =>
    items
      .filter((item) => item.authorHandle?.includes(flat?.flat ?? ''))
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
            {flat.outstanding.minor > 0 ? (
              <span className="text-attention">
                <Amount value={flat.outstanding} />
              </span>
            ) : (
              <Amount value={flat.outstanding} />
            )}
          </dd>
        </dl>

        <p className="mt-(--cf-s2) mb-0 text-meta text-ink-quiet">
          As of {formatDate(flat.asOf)}. Only you and the society&rsquo;s
          treasurer and secretary can see this.
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
            {mine.map((item) => (
              <li
                key={item.id}
                className={`pl-(--cf-s2) border-l-2 ${
                  item.resolvedAt ? 'border-rule' : 'border-attention'
                }`}
              >
                <p className="m-0 max-w-[68ch]">{item.question}</p>
                {item.answer && (
                  <p className="mt-(--cf-s1) mb-0 text-ink-quiet max-w-[68ch]">
                    {item.answer}
                  </p>
                )}
                <p className="m-0 text-meta text-ink-quiet">
                  {item.resolvedAt
                    ? `Answered ${formatDate(item.resolvedAt)}`
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
            ))}
          </ul>
        )}
      </Band>
    </>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
