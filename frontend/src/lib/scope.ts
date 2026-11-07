/*
 * WHAT SCOPE DID THIS READ ACTUALLY COVER?
 *
 * `flat_dues` is row-filtered by the server: a committee seat reads every
 * flat, anyone else reads only the flats they hold an open tenure on. The
 * totals in `api_summary` are NOT filtered - they stay society-wide, by
 * contract, because the balance and the dues total are public facts.
 *
 * Pair the two on one screen and they stop describing the same thing. A
 * resident sees "Flats owing 12 of 150" above a grid holding one tile, under
 * a heading that says "Charged to each flat" and a control labelled "Every
 * flat". Nothing throws. Nothing is red. The figures are each correct about
 * their own scope and the page is a lie about the society.
 *
 * That shape - two sources of truth for one fact, differing silently - is
 * the failure `0002` names for money and the one `countable.ts` fixed for a
 * null amount. The fix is the same in kind: do not let a surface state a
 * scope it cannot support.
 *
 * Deliberately derived from the DATA, not from the viewer's role:
 *
 *   - The server decides the filter. A client-side `isCommittee(me)` test
 *     would be a second opinion about access, and if the two ever disagreed
 *     the screen would trust the wrong one. No route in this tree refuses by
 *     role for exactly that reason.
 *   - It therefore keeps working if the filter changes again - a seat that
 *     reads its own wing, an auditor reading every flat - without this file
 *     knowing anything about seats.
 */

/**
 * `partial` when the read covered fewer flats than the society has, so the
 * surface must describe what it got rather than claim the whole society.
 *
 * `total` is the society's own flat count, from `api_summary`, which is not
 * row-filtered. `null` while it has not loaded: with nothing to compare
 * against, the honest answer is that the scope is not yet known.
 */
export type Scope = { kind: 'full' | 'partial' | 'unknown'; got: number; total: number | null }

export function scopeOf(rows: readonly unknown[] | undefined, total: number | null | undefined): Scope {
  const got = rows?.length ?? 0
  /*
   * A non-integer or negative total is not a count. Treating a broken one as
   * authoritative is how a bad figure becomes a claim about access: `got <
   * NaN` is false, which would silently report `full` for any subset.
   */
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
    return { kind: 'unknown', got, total: null }
  }
  if (rows === undefined) return { kind: 'unknown', got, total }
  /*
   * MORE rows than the society has flats is neither. `full` would assert the
   * two figures agree when they do not, and `partial` would assert a subset
   * when this is not one - a surface told `partial` says "showing 151 of
   * 150". Two figures that cannot both be right do not establish a scope.
   */
  if (got > total) return { kind: 'unknown', got, total }
  return { kind: got === total ? 'full' : 'partial', got, total }
}
