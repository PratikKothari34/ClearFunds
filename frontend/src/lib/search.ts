/*
 * LEDGER SEARCH.
 *
 * This lived in routes/ledger.tsx, where nothing could test it without
 * mounting a router, and it decides what a resident sees of their own money
 * history. A search that silently matches nothing does not look like a bug -
 * it looks like a society with no such entry.
 *
 * It also had an unwritten precondition: `hay` was lowercased and `q` was
 * not, so the caller HAD to pass an already-lowercased query. The route did,
 * eighteen lines away, and nothing in the signature said so. A second caller
 * passing the raw search param - or the route dropping that one .toLowerCase()
 * - would have made "Acme" find nothing while "acme" worked. The
 * normalisation now happens here, so there is no precondition to get wrong.
 */
import { categoryLabel } from './format'
import { countable } from './countable'
import type { LedgerRow } from './types'

/** `#12` - an exact sequence number, not a text fragment. */
const SEQ = /^#\d+$/
/** A query that is only digits, after the currency symbol and separators go. */
const DIGITS = /^\d+$/

/**
 * Does this row match what the resident typed?
 *
 * An empty or whitespace-only query matches everything, so clearing the box
 * restores the full ledger rather than emptying it.
 *
 * An unreadable amount matches no digit query rather than matching every one:
 * countable() refuses it, so such a row is found by its text or not at all.
 * It is never silently dropped from an unfiltered list - the `all` view keeps
 * it, which is the default.
 */
export function match(r: LedgerRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (SEQ.test(q)) return r.seq === Number(q.slice(1))

  const hay = [r.counterparty ?? '', r.narration, categoryLabel(r.category), r.reason ?? '']
    .join(' ')
    .toLowerCase()
  if (hay.includes(q)) return true

  // A figure is searched as the resident would write it: 1,250 or ₹1250 both
  // reach the stored minor units. Matched on the absolute value, because the
  // sign is the direction filter's job, not the search box's.
  const digits = q.replace(/[,₹\s]/g, '')
  if (!DIGITS.test(digits)) return false
  const amount = countable(r.amount_minor)
  return amount.readable && String(Math.abs(amount.minor)).startsWith(digits)
}
