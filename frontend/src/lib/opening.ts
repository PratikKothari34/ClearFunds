/*
 * THE OPENING OF THE CHAIN.
 *
 * society.v1.md, "Order at open": opening the ledger appends, in one
 * transaction, `society_opened` at sequence 1, then a `document_attached`
 * with `purpose` `election_minutes` at sequence 2, then one `tasks_set` per
 * post. And then, in the contract's own words:
 *
 *   "A chain whose sequence 2 is not a `document_attached` with `purpose`
 *    `election_minutes` was not opened under this contract. A verifier
 *    reports it, not passes it."
 *
 * Nothing checked it. walk() recomputes every hash and reports gaps and
 * unrecognised kinds, so a society opened with no election minutes verified
 * CLEAN - every hash correct, every link resolving, the head matching the
 * anchor. The chain was internally consistent and the society was not
 * constituted. That is precisely the gap a hash chain cannot close by
 * itself: it proves nothing was changed after the fact, never that the right
 * thing was written in the first place.
 *
 * WHY SEQUENCE 2 IS WORTH ITS OWN RULE. Opening is the one entry the chain
 * cannot repair later. Sequence 1 states the founding facts and sequence 2 is
 * the evidence that the committee which signs everything afterwards was
 * actually elected. Every approval in the chain traces its authority back
 * through those two entries; if the minutes are absent, every later signature
 * is valid and attests to the authority of a committee with nothing on record
 * electing it.
 *
 * WHY THIS IS NOT A 'break'. An absent or wrong opening is not evidence that
 * the record was tampered with - the overwhelmingly likelier cause is a
 * society opened by an older server, before the contract existed, or by a
 * route that did not write the document. Calling that tampering would teach
 * residents to ignore the one word that must keep its meaning. So it reports
 * at 'warn', in the resident's own terms, and says what is missing rather
 * than passing silently. See verdict() for the ordering: real evidence first.
 */

import type { Entry } from './chain'

/** What sequence 2 must be, per society.v1.md. */
const OPENING_KIND = 'document_attached'
const OPENING_PURPOSE = 'election_minutes'
/** What sequence 1 must be, per the same section. */
const FIRST_KIND = 'society_opened'

export type Opening =
  /** Sequence 1 and 2 are exactly what the contract requires. */
  | 'ok'
  /*
   * The chain is too short to tell. A chain of one entry is not a chain
   * opened wrongly - it is one we cannot judge yet, and the two must not
   * collapse into the same answer. Reported, never passed.
   */
  | 'short'
  /*
   * Sequence 2 exists and is not the election minutes. `found` is what is
   * there, for the screen to name. `purpose` is carried separately because a
   * `document_attached` of the WRONG purpose is a different mistake from some
   * other kind entirely, and a resident reading the screen deserves the
   * difference.
   */
  | { wrong: 'kind' | 'purpose' | 'first'; found: string }

/*
 * The opening is read from the entries, NOT from a count or a flag.
 *
 * Deliberately NOT a boolean. Three states, because the two failures are
 * different and a boolean would force "cannot tell" to share an answer with
 * one of them - the same partition mistake that made `countable` necessary
 * for money and `scope` necessary for row-filtered reads. "I could not tell"
 * is never "it is fine" and never "it is broken".
 */
export function opening(entries: Entry[]): Opening {
  /*
   * By sequence, not by array position. The verifier sorts, but it is handed
   * whatever the server served, and reading entries[1] would let a server
   * reorder its way to a pass - serve the minutes second in the array while
   * sequence 2 is something else. The sequence number is what the hash
   * covers, so the sequence number is what this reads.
   */
  const first = entries.find((e) => e.sequence === 1)
  const second = entries.find((e) => e.sequence === 2)

  // Too short to judge, which is not the same as judged and found wrong.
  if (!first || !second) return 'short'

  /*
   * Sequence 1 is checked too. The contract fixes both, and an opening whose
   * first entry is not `society_opened` was not opened under it either -
   * reporting only on sequence 2 would pass a chain that fails the same
   * paragraph one line higher up.
   */
  if (first.kind !== FIRST_KIND) return { wrong: 'first', found: first.kind }

  if (second.kind !== OPENING_KIND) return { wrong: 'kind', found: second.kind }

  /*
   * The purpose is read as a string and compared. A body field is server
   * data, so it may be any JSON value: an object or a number must fail this
   * rather than reach String() and compare as "[object Object]". The
   * contract says later contracts may add values, so an unexpected purpose
   * is a mismatch to report, not an error to throw.
   */
  const purpose = second.body.purpose
  if (typeof purpose !== 'string') return { wrong: 'purpose', found: '(not recorded)' }
  if (purpose !== OPENING_PURPOSE) return { wrong: 'purpose', found: purpose }

  return 'ok'
}

/**
 * One line for a resident, in their words. Never "invalid", never "tampered":
 * the likeliest cause is an older opening, and the sentence has to be true
 * for that case as well as the worst one.
 */
export function openingLine(o: Opening): string | null {
  if (o === 'ok') return null
  if (o === 'short') return 'This record is too short to show how the society was opened.'
  if (o.wrong === 'first') return `This record does not begin with the society being opened, so how it was opened cannot be shown. It begins with "${o.found}".`
  if (o.wrong === 'kind') return `This record does not carry the election minutes the society was opened with, so who was elected to the committee cannot be shown from it. Entry 2 is "${o.found}".`
  return `This record's second entry is a document, but not the election minutes, so who was elected to the committee cannot be shown from it. It is recorded as "${o.found}".`
}
