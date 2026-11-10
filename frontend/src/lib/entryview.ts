/*
 * WHAT AN ENTRY PAGE MAY SAY ABOUT A SEQ IT CANNOT SHOW.
 *
 * `/entry/$seq` had one branch for every unhappy case:
 *
 *   !r || !p ? "Entry #{seq} is not a money entry."
 *
 * That sentence is a statement about the chain, and the route printed it in
 * three situations where it had not established anything of the kind.
 *
 * 1. A SEQ THAT DOES NOT EXIST. `/entry/abc` makes `Number(seq)` NaN and
 *    `/entry/99999999` matches nothing. Neither is a record whose nature can
 *    be described, and "Entry #abc is not a money entry" asserts that a thing
 *    which was never in the ledger has been looked at and classified.
 *
 * 2. A READ THAT FAILED. `ledger.data?.find(...)` is `undefined` when the
 *    query ERRORED, exactly as it is when the row is genuinely absent - the
 *    `?? []` shape, where a settled-but-failed read is drawn as an empty one.
 *    So a dropped connection produced the same confident sentence about the
 *    society's records. An empty state is a CLAIM; a failure is not entitled
 *    to make it. The error arm is read BEFORE the data arm for that reason.
 *
 * 3. A POSTING WHOSE PROPOSAL IS MISSING. `r` found and `p` not is a different
 *    thing again: the money entry exists and its authorisation did not come
 *    back. Saying it "is not a money entry" denies the row the reader is
 *    looking at.
 *
 * This is the product's own claim turned around. The ledger's whole promise is
 * that the record can be checked, so a screen that says "this is not a money
 * entry" when it means "I could not load it" is the one sentence it must never
 * get wrong. `missing` and `unreadable` are distinct for the same reason
 * `scope.ts` has three states and not two: "I do not know" is an answer, and
 * collapsing it into a definite one is the defect.
 */

export type EntryOutcome =
  /** Either read is still in flight. Say nothing yet. */
  | { kind: 'loading' }
  /** A read failed. Nothing may be concluded about the seq. */
  | { kind: 'unreadable' }
  /** The seq is not a number at all, so there is nothing to look up. */
  | { kind: 'malformed' }
  /** Both reads succeeded and no money posting carries this seq. */
  | { kind: 'missing' }
  /** The posting exists; the proposal that authorised it did not come back. */
  | { kind: 'orphaned' }
  /** Everything needed to render the entry is here. */
  | { kind: 'ready' }

export type ReadState = {
  isPending: boolean
  isError: boolean
  /** True when this read settled and the row was genuinely not among them. */
  found: boolean
}

/**
 * Decide what the entry page is entitled to say.
 *
 * Takes the two reads' states rather than their rows: the rule is about which
 * CONCLUSION is licensed, and a function handed the rows would have to repeat
 * the `undefined`-means-two-things confusion that caused the bug.
 *
 * `seqIsNumber` is passed separately because a malformed seq is knowable
 * without any read at all, and a route that waits for a network round trip to
 * reject `/entry/abc` is doing work to arrive at an answer it already had.
 */
export function entryOutcome(
  seqIsNumber: boolean,
  ledger: ReadState,
  proposals: ReadState,
): EntryOutcome {
  /*
   * Failure first, then pending, then the data. A failed read arrives WITH
   * whatever was cached in hand, the same shape as a background refetch that
   * errors while the last good rows are still there - the `verify.stale`
   * lesson. Reading the data first would let a stale hit answer a question the
   * failed read has made unanswerable.
   */
  if (ledger.isError || proposals.isError) return { kind: 'unreadable' }
  if (!seqIsNumber) return { kind: 'malformed' }
  if (ledger.isPending || proposals.isPending) return { kind: 'loading' }

  if (!ledger.found) return { kind: 'missing' }
  if (!proposals.found) return { kind: 'orphaned' }
  return { kind: 'ready' }
}

/**
 * The sentence each outcome licenses.
 *
 * Kept beside the decision so the wording cannot drift from the state it
 * describes: the defect was a true-sounding sentence attached to the wrong
 * condition, which is a copy bug and a logic bug at once.
 */
export function entryMessage(kind: EntryOutcome['kind'], seq: string): string | null {
  switch (kind) {
    case 'unreadable':
      // Never "does not exist": nothing was established about this seq.
      return 'This entry could not be loaded, so this is not saying it does not exist.'
    case 'malformed':
      return `“${seq}” is not an entry number.`
    case 'missing':
      return `No money entry in this society has the number ${seq}. It may be a record of another kind — an approval, a flag or an appointment — which the full record shows.`
    case 'orphaned':
      return `Entry #${seq} is here, but the proposal that authorised it could not be loaded, so it is not shown in full.`
    case 'loading':
    case 'ready':
      return null
  }
}
