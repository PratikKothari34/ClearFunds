import { Band } from './Band'
import { canSeeFlagAuthor } from '../lib/identity'
import { useViewerRole } from '../lib/viewer'
import type { FlagLogItem } from '../lib/types'
import { resolvedOn } from '../lib/flags'
import { formatDate } from '../lib/dates'

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
  /**
   * `null` means the log was not fetched; `[]` means nobody has asked.
   *
   * These must stay distinguishable all the way to the screen. Collapsed
   * to one empty array — which this component used to receive — a failed
   * read renders "Nobody has asked about this entry.", and an open
   * question about this payment sits invisible behind a sentence saying
   * none exists.
   */
  readonly entries: readonly FlagLogItem[] | null
}) {
  const showAuthor = canSeeFlagAuthor(useViewerRole())

  if (entries === null) {
    return (
      <Band heading="Questions raised" headingId="cf-entry-flags">
        <p className="m-0 text-on-error-container max-w-[68ch]">
          The questions on this entry could not be loaded, so they are not
          shown. This does NOT mean nobody has asked about it. The entry above
          is unaffected — nothing has been changed.
        </p>
      </Band>
    )
  }

  return (
    <Band heading="Questions raised" headingId="cf-entry-flags">
      {entries.length === 0 ? (
        <p className="m-0 text-on-surface-variant max-w-[68ch]">
          Nobody has asked about this entry.
        </p>
      ) : (
        <ol className="list-none m-0 p-0 flex flex-col gap-space-lg">
          {entries.map((item) => {
            /*
             * Resolved ONCE, into a local. Calling `resolvedOn(item)`
             * twice - in the test and again in the body - needed a cast
             * to convince the compiler the second call was non-null,
             * and a cast is exactly the reach back to the raw value
             * that let `resolvedAt: ""` through in the first place.
             */
            const answeredOn = resolvedOn(item)
            return (
            <li
              key={item.id}
              className={`pl-space-md border-l-2 ${
                answeredOn === null ? 'border-tertiary-fixed' : 'border-outline-variant'
              }`}
            >
              <p className="m-0 max-w-[68ch]">{item.question}</p>
              <p className="m-0 font-label-code-sm text-label-code-sm text-on-surface-variant">
                {/*
                 * The handle, or nothing — checked against the viewer's
                 * role as well as against the payload.
                 *
                 * A resident payload should omit the author of another
                 * resident's question, and that omission remains the
                 * real protection: only the server can keep a handle out
                 * of a response. But this component rendered whatever
                 * arrived, so a payload that over-shares — a backend
                 * bug, a shared endpoint, one role's response reused for
                 * another — put the identity straight on a resident's
                 * screen. Two independent checks, because the one that
                 * matters is not ours.
                 */}
                {showAuthor && item.authorHandle
                  ? `${item.authorHandle} · `
                  : ''}
                {formatDate(item.raisedAt)}
                {' · '}
                {/*
                 * `resolvedOn`, not `item.resolvedAt`, and not a
                 * truthiness test: a flag carrying `resolvedAt: ""` is
                 * truthy, so this printed "Answered " with nothing
                 * after it while the badge counted the same question
                 * as open.
                 */}
                {answeredOn !== null ? (
                  <span>Answered {formatDate(answeredOn)}</span>
                ) : (
                  // --attention, not --break: an open question is
                  // something to do, not something broken.
                  <span className="text-on-tertiary-fixed-variant">Not answered yet</span>
                )}
              </p>

              {item.answer && (
                <p className="mt-space-sm mb-0 text-on-surface-variant max-w-[68ch]">
                  {item.answer}
                </p>
              )}
            </li>
            )
          })}
        </ol>
      )}
    </Band>
  )
}
