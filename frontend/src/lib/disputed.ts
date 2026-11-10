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

/*
 * AN UNREADABLE DISPUTE LIST IS NOT AN EMPTY ONE.
 *
 * `disputedBy(undefined)` returns a predicate that claims nothing, which is
 * the only honest thing a predicate CAN do - a boolean has no third value.
 * The bug is the caller believing it. `useDisputes()` is a plain `useQuery`,
 * so `.data` is `undefined` while pending AND on error, and the ledger route
 * read that single value as the answer. When the disputes read failed but the
 * ledger loaded:
 *
 *   - the "Disputed" filter rendered "No entries match - try another word",
 *     telling a resident that nothing in the society is contested
 *   - every row in every other view rendered WITHOUT its flag, so a disputed
 *     entry looked clean
 *
 * Same family as the nav badge in badge.ts (`?? []` on a failed read) and as
 * `null <= 0` in countable.ts: a fallback indistinguishable from a real
 * answer. The ledger is the surface the whole product exists to show a
 * resident, and the flag is the only place a dispute appears on it.
 *
 * So the state is resolved HERE, from the query's own flags rather than from
 * `.data` alone, and it answers three ways. `unknown` carries the predicate
 * too - it still claims nothing, because there is nothing to claim - so a
 * caller that forgets to branch is no worse off than before, while one that
 * branches can say "we could not check".
 */

/** What a surface may say about disputes right now. */
export type DisputeState =
  | { kind: 'ready'; is: (r: LedgerRow) => boolean }
  | { kind: 'pending'; is: (r: LedgerRow) => boolean }
  | { kind: 'unknown'; is: (r: LedgerRow) => boolean }

/** The query's shape as this module reads it, by shape rather than by import. */
type DisputeQuery = {
  data: readonly DisputeRow[] | undefined
  isPending: boolean
  isError: boolean
}

/**
 * Resolves a disputes read into what the ledger is entitled to claim.
 *
 * ERROR IS CHECKED FIRST, and that order is the guard. TanStack keeps the
 * last successful `data` across a background refetch that fails, so a read
 * can be `isError` with rows still in hand; reporting those as `ready` would
 * present a stale answer as a current one on the one surface where a missing
 * flag is a false statement about money. An errored read is `unknown` whether
 * or not it is holding rows.
 *
 * `pending` is separated from `unknown` because a surface should say
 * different things: a load is in progress and will resolve itself, a failure
 * will not. Both are "we cannot answer yet", neither is "nothing is
 * disputed".
 */
export function disputeState(q: DisputeQuery): DisputeState {
  const is = disputedBy(q.isError ? undefined : q.data)
  if (q.isError) return { kind: 'unknown', is }
  if (q.isPending || q.data === undefined) return { kind: 'pending', is }
  return { kind: 'ready', is }
}
