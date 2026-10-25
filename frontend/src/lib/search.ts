import type {
  AdjustingEntry,
  AuditYear,
  CommitteeSeat,
  DuesRow,
  Entry,
  MatrixRow,
  OpinionSeverity,
  PendingApproval,
} from './types'
import type { Money } from './money'

/*
 * TEXT SEARCH OVER WHAT IS ALREADY ON SCREEN.
 *
 * This filters rows the server already sent. It is not a query: nothing
 * here fetches, and nothing here computes money. A real ledger search has
 * to run on the server, because this surface only ever holds one page.
 *
 * Three rules shape every function in this file:
 *
 *   1. A REVERSED PAIR IS ONE ITEM. Filtering must never show a reversal
 *      whose original has been filtered out from under it, or the screen
 *      claims money moved and never came back. `matchEntries` keeps both
 *      halves whenever EITHER matches.
 *   2. AN AMOUNT IS MATCHED ON ITS DIGITS. A resident types 18500, the
 *      screen shows "- 1,85,000.00", and neither the grouping commas nor
 *      the sign nor the decimal point should defeat them.
 *   3. NO MATCH IS NOT THE SAME AS NO DATA. The functions return an empty
 *      array; it is the caller's job to say which of the two happened.
 *      `LedgerList`'s `emptyMessage` prop exists for exactly this.
 */

/* What the user typed, reduced to something comparable. */
function norm(query: string): string {
  return query.trim().toLowerCase()
}

/*
 * Digits of the query, if it is a number the user could be reaching for.
 *
 * `null` when the query has no digits at all, so a text-only search never
 * pays for the amount comparison.
 */
function digitsOf(query: string): string | null {
  const digits = query.replace(/\D+/g, '')
  return digits.length === 0 ? null : digits
}

/*
 * Does this money's minor-unit figure contain the typed digits?
 *
 * Compared as a STRING on `Math.abs`, deliberately:
 *
 *   - This is not arithmetic. It never adds, scales or rounds, so it does
 *     not breach the rule that the frontend computes no money. Formatting
 *     and now matching are the only things allowed to read `.minor`.
 *   - The sign is dropped because a resident searching for an expense
 *     types the amount, not the minus. Direction is a separate field on
 *     this schema anyway, so the sign is not even the row's own signal.
 *   - A non-finite `.minor` cannot be searched. It returns false rather
 *     than throwing or stringifying to "NaN", which would otherwise make
 *     a query of "na" match an unreadable figure.
 */
function amountHasDigits(
  money: Money | null | undefined,
  digits: string,
): boolean {
  if (money === null || money === undefined) return false
  if (!Number.isFinite(money.minor)) return false
  return String(Math.abs(money.minor)).includes(digits)
}

/* Does any of these strings contain the query? */
function anyText(
  haystack: readonly (string | null | undefined)[],
  q: string,
): boolean {
  for (const s of haystack) {
    if (s !== null && s !== undefined && s.toLowerCase().includes(q)) {
      return true
    }
  }
  return false
}

/*
 * Ledger entries.
 *
 * Returns entries, not rows, so `pair()` still does the pairing - one place
 * decides what a pair is. The two-pass shape is the whole point: pass one
 * finds the matches, pass two pulls in the other half of any pair a match
 * belongs to, in BOTH directions (a matched original keeps its reversal, a
 * matched reversal keeps its original).
 *
 * MATCHED ON `sequence`, NOT `id`. The chain position is what a resident
 * reads on the row and types into the box ("#847"); `id` is an opaque
 * server identifier they never see.
 */
export function matchEntries(
  entries: readonly Entry[],
  query: string,
): readonly Entry[] {
  const q = norm(query)
  if (q === '') return entries

  const digits = digitsOf(q)

  const matched = new Set<string>()
  for (const e of entries) {
    const text = anyText(
      [
        e.narration,
        e.payee,
        e.state,
        /* Searchable as "#847" or "847". */
        '#' + String(e.sequence),
        e.reversalReason,
      ],
      q,
    )

    if (text || (digits !== null && amountHasDigits(e.amount, digits))) {
      matched.add(e.id)
    }
  }

  /*
   * Pull in the partner of every matched half of a reversed pair, in both
   * directions and through both links.
   *
   * `reverses` sits on the reversal and points back; `reversedBy` sits on
   * the reversed entry and points forward. Following only one of them loses
   * the pair whenever the other is the half that matched, which is rule 1
   * failing silently - the screen then shows an expense with no correction
   * beside it, or a correction with nothing it corrects.
   */
  const keep = new Set(matched)
  for (const e of entries) {
    if (e.state === 'reversal' && e.reverses !== undefined) {
      if (matched.has(e.id)) keep.add(e.reverses.id)
      if (matched.has(e.reverses.id)) keep.add(e.id)
    }
    if (e.state === 'reversed' && e.reversedBy !== undefined) {
      if (matched.has(e.id)) keep.add(e.reversedBy.id)
      if (matched.has(e.reversedBy.id)) keep.add(e.id)
    }
  }

  return entries.filter((e) => keep.has(e.id))
}

export function matchApprovals(
  approvals: readonly PendingApproval[],
  query: string,
): readonly PendingApproval[] {
  const q = norm(query)
  if (q === '') return approvals

  const digits = digitsOf(q)

  return approvals.filter((a) => {
    if (anyText([a.narration, a.payee, a.tier, a.raisedByHandle], q)) {
      return true
    }
    return digits !== null && amountHasDigits(a.amount, digits)
  })
}

/*
 * Dues rows.
 *
 * Billed and paid are searchable; `outstanding` is NOT, even though it is
 * on screen. It is the figure that can be unreadable, and a flat whose
 * outstanding could not be computed must not quietly drop out of a search
 * for an amount - that is the same "count came out too low" failure the
 * three-way partition in `countable.ts` exists to prevent.
 */
export function matchDues(
  rows: readonly DuesRow[],
  query: string,
): readonly DuesRow[] {
  const q = norm(query)
  if (q === '') return rows

  const digits = digitsOf(q)

  return rows.filter((r) => {
    if (anyText([r.flat], q)) return true
    if (digits === null) return false
    return amountHasDigits(r.billed, digits) || amountHasDigits(r.paid, digits)
  })
}

/* The by-flat matrix. Same rule as dues on `outstanding`. */
export function matchMatrix(
  rows: readonly MatrixRow[],
  query: string,
): readonly MatrixRow[] {
  const q = norm(query)
  if (q === '') return rows

  const digits = digitsOf(q)

  return rows.filter((r) => {
    if (anyText([r.flat, r.tenancy], q)) return true
    if (digits === null) return false
    return amountHasDigits(r.billed, digits) || amountHasDigits(r.paid, digits)
  })
}

/*
 * The committee roster.
 *
 * `holderHandle` is a HANDLE, never a name, so this searches what is
 * actually rendered. A vacant seat has no holder and no office, and
 * `anyText` skips the absent fields rather than matching an empty string.
 */
export function matchCommittee(
  seats: readonly CommitteeSeat[],
  query: string,
): readonly CommitteeSeat[] {
  const q = norm(query)
  if (q === '') return seats

  return seats.filter((m) =>
    anyText([m.holderHandle, m.office, m.status, '#' + String(m.seat)], q),
  )
}

/*
 * Audit years.
 *
 * `opinion` is matched on the stored value AND on the label the screen
 * shows, because they differ in case and a resident types what they read.
 * A year with no opinion yet matches on its year alone.
 */
export function matchAuditYears(
  years: readonly AuditYear[],
  query: string,
  label: (opinion: OpinionSeverity) => string,
): readonly AuditYear[] {
  const q = norm(query)
  if (q === '') return years

  return years.filter((y) =>
    anyText(
      [
        y.year,
        y.opinion,
        y.opinion === undefined ? undefined : label(y.opinion),
        y.opinionNote,
      ],
      q,
    ),
  )
}

/*
 * Closed-year adjustments.
 *
 * The reason is searchable because it is the disclosure - the text that
 * must reach the AGM. Searching the amount without it would let someone
 * find the figure and miss why it exists.
 */
export function matchAdjustments(
  adjustments: readonly AdjustingEntry[],
  query: string,
): readonly AdjustingEntry[] {
  const q = norm(query)
  if (q === '') return adjustments

  const digits = digitsOf(q)

  return adjustments.filter((a) => {
    if (anyText([a.correctsYear, a.reason], q)) return true
    return digits !== null && amountHasDigits(a.amount, digits)
  })
}
