import type { Check } from './verify'

/**
 * What the fingerprint band may say about the published record, in one short
 * fact - and the whole point is that it must answer for ALL FIVE anchor
 * states, not the two that are easy to name.
 *
 * `Check['anchor']` is `'unpublished' | 'unreachable' | 'matches' | 'behind' |
 * { mismatch: Head }`. `Provenance` tested the first three in a chained
 * ternary and let everything else fall to the final `else`, which read
 * **"Not published outside the committee"** - the benign line for a society
 * that has not set publishing up yet. So the two states that mean *the
 * published record contradicts what you are being shown*:
 *
 *   - `'behind'`      - more entries were published than the server sent
 *   - `{ mismatch }`  - the published fingerprint disagrees with this device
 *
 * both reported as *nothing is published*. The row still turned red, because
 * `verdict()` gets these right and headlined "The record differs from the
 * published fingerprint" - so the band contradicted itself, claiming a
 * difference from a fingerprint the next line said did not exist. A resident
 * who reads the detail line gets the reassuring half of that.
 *
 * Extracted because the same five states are also rendered on `/verify`,
 * correctly, as a chained ternary inside a route - a rule in two places with
 * no shared decision, where one copy was already wrong. A rule that belongs
 * in `lib/` lives in `lib/`, so it can be tested without a router.
 *
 * `missing` marks the states where no fingerprint has been compared, which is
 * NOT the same as a comparison that failed. The caller may style those
 * differently; it must never style a failure as an absence.
 */
export type AnchorFact = { text: string; missing: boolean }

export function anchorFact(anchor: Check['anchor'], head: Check['anchorHead'], at: (ms: number) => string): AnchorFact {
  // A published head whose timestamp cannot be read is still a published head.
  if (anchor === 'matches') {
    return head ? { text: `Published ${at(head.as_of)}`, missing: false } : { text: 'Published fingerprint matches', missing: false }
  }
  if (anchor === 'unreachable') return { text: 'Published record unreachable', missing: true }
  if (anchor === 'unpublished') return { text: 'Not published outside the committee', missing: true }

  /*
   * Everything below here is a FAILED comparison, never an absent one. The
   * previous code's `else` is this branch, and it said the opposite.
   */
  if (anchor === 'behind') return { text: 'Fewer entries sent than were published', missing: false }
  return { text: 'Differs from the published fingerprint', missing: false }
}

/**
 * The same five states, said at length - for `/verify`, where an auditor
 * needs the sequence numbers, not a four-word fact.
 *
 * The TEXT is deliberately not shared with `anchorFact`: a diagnostic page
 * that said "Differs from the published fingerprint" and nothing more would
 * be worse. What IS shared is the classification - `ok` is derived from the
 * same `missing` flag - so the band and the page can never disagree about
 * whether a state is an absence or a failure. They did disagree: the band
 * read `'behind'` and `{ mismatch }` as "not published".
 *
 * `ok: null` means nothing was compared; `false` means a comparison failed.
 * Lives here rather than in the route because it decides, and a decision in a
 * route file cannot be tested without mounting a router - so it would not be.
 */
export function anchorRow(
  anchor: Check['anchor'],
  head: Check['anchorHead'],
  serverSeq: number,
  at: (ms: number) => string,
): { ok: boolean | null; text: string } {
  const { missing } = anchorFact(anchor, head, at)
  // A failure must never be reported as an absence, so `ok` follows `missing`.
  const failed = missing ? null : false

  if (anchor === 'matches') {
    return {
      ok: true,
      text: head
        ? `Published ${at(head.as_of)} at entry ${head.highest_sequence}.`
        : 'The published fingerprint matches the record the server sent.',
    }
  }
  if (anchor === 'unpublished') {
    return { ok: null, text: 'No fingerprint is published outside the committee yet. Until one is, this check cannot show that nothing was left out.' }
  }
  if (anchor === 'unreachable') {
    return { ok: null, text: 'The published record could not be reached from this phone.' }
  }
  if (anchor === 'behind') {
    // The published count is the point of this message; without a head there
    // is still a discrepancy to report, so it degrades rather than vanishing.
    const published = head ? ` (${head.highest_sequence})` : ''
    return { ok: failed, text: `More entries were published${published} than the server sent (${serverSeq}).` }
  }
  return { ok: failed, text: 'The published fingerprint differs from the record the server sent.' }
}
