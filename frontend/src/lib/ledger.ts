import type { Entry } from './types'

/**
 * Rules about the ledger as a sequence, kept out of the route files.
 *
 * Same reason as signoff.ts: these are rules, not rendering. A helper
 * left inside a route cannot be tested without mounting a router, so it
 * does not get tested — which is how every bug this module exists to
 * prevent survived its first review. Each function below was a line of
 * logic sitting in a route file, and each one was wrong there.
 */

/**
 * The newest entry, chosen by sequence rather than array position.
 *
 * `entries[0]` is only the newest while the list happens to arrive
 * sorted newest-first, and nothing in the wire contract promises that.
 * The assumption is invisible exactly as long as it holds, and the
 * surface that depends on it — the verify page, naming which entry was
 * compared against the published record — is the one place where a
 * confidently wrong answer undermines the product's central claim.
 *
 * `sequence` is the chain position, so the maximum is the newest by
 * definition. Deriving it costs one pass over a list that is already in
 * memory.
 */
export function newestEntry(
  entries: readonly Entry[],
): Entry | undefined {
  return entries.reduce<Entry | undefined>((newest, e) => {
    /*
     * The value check, not only the ordering one.
     *
     * Deriving the maximum guards the array-POSITION assumption. It does
     * not guard the VALUE: every comparison against NaN is false, so
     * `e.sequence > newest.sequence` neither accepts nor rejects a
     * malformed position — it leaves the answer to where the row sits.
     * A row with no usable sequence placed first is taken by the
     * `undefined` branch below and then nothing can beat it, so the
     * genuinely newest entry is discarded.
     *
     * That lands on `/verify`, which names which entry was compared
     * against the published chain head. The visible version is
     * `#NaN`; the dangerous version is an OLD entry that merely lost
     * its sequence being named as the newest, with a real number and a
     * real date beside it, on the one page whose job is to state what
     * was compared.
     *
     * `Number.isInteger` rather than `typeof === 'number'`, which
     * admits NaN. Dropping an unusable row is right here: `/verify`
     * already renders 'None' for no entry, which is honest, and `#NaN`
     * is not.
     */
    if (!Number.isInteger(e.sequence)) return newest
    if (newest === undefined) return e
    return e.sequence > newest.sequence ? e : newest
  }, undefined)
}

/**
 * The entries to list, newest first by chain position.
 *
 * The ledger's rows are read top to bottom as a running balance, so
 * array order IS the claim the page makes about sequence. Nothing in the
 * wire contract promises the server sends them sorted, and the fixture
 * itself did not: its hand-written head is 847, 846, 845, 848, which put
 * the newest entry fourth, between 845 and 844, with two rows reporting
 * the same closing balance and no way to reconcile the column.
 *
 * Sorted on `sequence`, never `postedAt`: a reversal can post in the
 * same minute as the entry it cancels, and two equal timestamps leave
 * the order undefined again. `sequence` is the chain position, so it is
 * total by construction.
 *
 * Rows with no usable sequence go LAST rather than being dropped. This
 * is a display order, not a correctness gate — silently hiding an entry
 * from the history is the one thing this product must never do, and the
 * row still renders its own amount and date honestly.
 */
export function inChainOrder(entries: readonly Entry[]): readonly Entry[] {
  return [...entries].sort((a, b) => {
    const aOk = Number.isInteger(a.sequence)
    const bOk = Number.isInteger(b.sequence)
    if (!aOk && !bOk) return 0
    if (!aOk) return 1
    if (!bOk) return -1
    return b.sequence - a.sequence
  })
}

/**
 * The reversed entries to list as top-level rows.
 *
 * A reversed entry and its reversal are ONE row item by design — the
 * reversal is rendered as a link beside the entry it cancels, never as
 * its own row. Admitting `state === 'reversal'` as a top-level row
 * therefore lists one correction twice: once struck through as money
 * paid out, once again as money received, with the same reason text
 * under both and a count above saying two entries. For a non-technical
 * resident that reads as twice the movement, on the one tab that exists
 * to explain corrections.
 *
 * A reversal whose cancelled entry is NOT in the same list is kept,
 * because dropping it would hide a real chain entry: on a filtered or
 * paginated response the pair can be split, and an orphan reversal
 * explained by a link is better than a correction that is absent.
 */
export function reversedRows(entries: readonly Entry[]): readonly Entry[] {
  const listedIds = new Set(entries.map((e) => e.id))
  return entries.filter((e) => {
    if (e.state === 'reversed') return true
    if (e.state !== 'reversal') return false
    // Orphan only: the entry it cancels is not in this list, so no row
    // above already carries it.
    return e.reverses === undefined || !listedIds.has(e.reverses.id)
  })
}

/**
 * Whether a comparison against the published record actually happened.
 *
 * The anchor status and the ledger are two independent reads, coupled
 * only by sitting on the same page. With a `match` anchor and no
 * entries — which is exactly what a production build holds today — the
 * verify page prints "Newest entry here: None" directly above "Nothing
 * in the history has been changed since it was published." Zero entries
 * were compared and the page states the history matches, on the one
 * surface carrying the product's central claim.
 */
export function comparedAnything(entries: readonly Entry[]): boolean {
  return newestEntry(entries) !== undefined
}
