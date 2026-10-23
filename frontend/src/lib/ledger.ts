import type { Entry } from './types'

/**
 * Rules about the ledger as a sequence, kept out of the route files.
 *
 * Same reason as signoff.ts: these are rules, not rendering. A helper
 * left inside a route cannot be tested without mounting a router, so it
 * does not get tested — which is how both of the bugs this module exists
 * to prevent survived their first review.
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
  return entries.reduce<Entry | undefined>(
    (newest, e) => (newest === undefined || e.sequence > newest.sequence ? e : newest),
    undefined,
  )
}
