import type { DisputeRow, LedgerRow } from './types'

/**
 * Builds the predicate for the ledger's "disputed" filter.
 *
 * Lives here rather than in the route because it is a rule, and a rule in a
 * route file cannot be tested without mounting a router - so it was not
 * tested. What a resident sees under this filter is the whole point of the
 * dispute feature, and the payee half below had no coverage at all.
 *
 * Matches TWO ways, and the second is the one a server-side version would
 * miss: an open dispute naming a `counterparty` flags EVERY entry to that
 * payee, not only the entries it cited. A resident disputing "Sharma
 * Plumbing" is disputing the payee, and seeing one of four payments to them
 * marked while the other three look clean is the opposite of what the filter
 * is for.
 *
 * Closed disputes do not flag anything. The dispute stays in the entry's
 * append-only log either way - this filter is a to-do list, not the record.
 */
export function disputedBy(disputes: readonly DisputeRow[] | undefined): (r: LedgerRow) => boolean {
  const seqs = new Set<number>()
  const payees = new Set<string>()
  for (const d of disputes ?? []) {
    if (!d.is_open) continue
    for (const s of d.target_seqs) seqs.add(s)
    // Lowercased on both sides: the payee is free text typed by whoever
    // raised the dispute, so "Sharma Plumbing" and "sharma plumbing" are the
    // same payee and a case-sensitive compare would silently flag neither.
    if (d.counterparty) payees.add(d.counterparty.toLowerCase())
  }
  return (r) => seqs.has(r.seq) || (!!r.counterparty && payees.has(r.counterparty.toLowerCase()))
}
