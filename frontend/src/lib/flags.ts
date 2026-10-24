import type { FlagLogItem } from './types'

/**
 * Whether a question is still waiting for an answer.
 *
 * ONE PREDICATE, because there were three spellings of it across four
 * surfaces and two of them disagreed:
 *
 *   - `counts.ts` asked `flag.resolvedAt == null`
 *   - `disputes.tsx` asked `!flag.resolvedAt`
 *   - `FlagHistory` and `my-flat` asked `flag.resolvedAt ? ... : ...`
 *
 * They agree on `null` and `undefined` and on a real timestamp. They
 * disagree on the empty string, which `== null` calls unresolved and
 * the other two call answered. So a flag carrying `resolvedAt: ""`
 * was counted in the badge residents are shown AND filed under
 * "Answered" on the page, where it printed the word with no date
 * after it. A resident chasing the badge would find nothing open.
 *
 * The empty string is not a hypothetical: it is what a form submits
 * for an untouched date field, and what a serialiser emits for a null
 * column in several common configurations.
 *
 * THE DIRECTION OF THE RULE IS DELIBERATE. Anything that is not a
 * usable timestamp counts as UNRESOLVED, so a malformed value
 * over-reports open questions rather than hiding them. Hiding is the
 * failure that matters here — an unanswered question about a payment,
 * invisible behind a figure saying there is nothing to chase, on the
 * one surface the product exists to make honest.
 */
export function isUnresolved(flag: FlagLogItem): boolean {
  return !isResolvedAt(flag.resolvedAt)
}

/**
 * Whether a question has been answered, with the date it was answered.
 *
 * The companion to `isUnresolved`, and not merely its negation at the
 * call site: a surface that prints "Answered {date}" needs to know the
 * value is PRINTABLE, not just present. `resolvedAt: ""` is present.
 *
 * Returns the timestamp so the caller cannot narrow and then reach for
 * the raw field again — the reach is where the empty string got back
 * in.
 */
export function resolvedOn(flag: FlagLogItem): string | null {
  return isResolvedAt(flag.resolvedAt) ? flag.resolvedAt : null
}

/**
 * A resolution timestamp that can actually be shown.
 *
 * Not `typeof value === 'string'`: that admits `""` and whitespace. Not
 * `Date.parse` either — a resolution date is recorded by the server and
 * this is a display guard, so a value that is non-empty but not
 * parseable should reach `formatDate`, which has its own
 * unparseable-date behaviour, rather than being silently reclassified
 * as unanswered here. Two layers deciding the same thing differently is
 * how the disagreement above started.
 */
function isResolvedAt(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim() !== ''
}
