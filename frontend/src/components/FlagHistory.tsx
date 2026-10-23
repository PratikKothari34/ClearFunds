import { Band } from './Band'
import type { FlagLogItem } from '../lib/types'

/**
 * An entry's question log — all of it, resolved and unresolved.
 *
 * THE LOG IS THE RECORD; THE COUNT IS A TO-DO LIST. The ledger's badge
 * counts unresolved questions only, because a count is for deciding
 * what to do next. This list is the opposite: it keeps every question
 * ever raised and every answer given, because a resolved question that
 * vanishes is indistinguishable from one that was never asked.
 * Resolution is itself an appended record, not a deletion.
 *
 * Authors are handles, never names. On a resident's payload the author
 * of someone else's question is absent from the data entirely — not
 * present and hidden — so there is nothing here for a devtools pane to
 * reveal. Treasurer, secretary and president see identities; residents
 * are anonymous to each other.
 *
 * Nothing on this surface moves money. A question has no financial
 * effect: residents ask, admins reverse.
 */

export function FlagHistory({
  entries,
}: {
  readonly entries: readonly FlagLogItem[]
}) {
  return (
    <Band heading="Questions raised" headingId="cf-entry-flags">
      {entries.length === 0 ? (
        <p className="m-0 text-ink-quiet max-w-[68ch]">
          Nobody has asked about this entry.
        </p>
      ) : (
        <ol className="list-none m-0 p-0 flex flex-col gap-(--cf-s3)">
          {entries.map((item) => (
            <li
              key={item.id}
              className={`pl-(--cf-s2) border-l-2 ${
                item.resolvedAt ? 'border-rule' : 'border-attention'
              }`}
            >
              <p className="m-0 max-w-[68ch]">{item.question}</p>
              <p className="m-0 text-meta text-ink-quiet">
                {/*
                 * The handle, or nothing. A resident payload omits the
                 * author of another resident's question, so the absence
                 * is the anonymity rather than a styling choice.
                 */}
                {item.authorHandle ? `${item.authorHandle} · ` : ''}
                {formatDate(item.raisedAt)}
                {' · '}
                {item.resolvedAt ? (
                  <span>Answered {formatDate(item.resolvedAt)}</span>
                ) : (
                  // --attention, not --break: an open question is
                  // something to do, not something broken.
                  <span className="text-attention">Not answered yet</span>
                )}
              </p>

              {item.answer && (
                <p className="mt-(--cf-s1) mb-0 text-ink-quiet max-w-[68ch]">
                  {item.answer}
                </p>
              )}
            </li>
          ))}
        </ol>
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
