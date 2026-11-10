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

/*
 * THE SAME QUESTION ON ONE ENTRY, WHERE THE ROWS THEMSELVES ARE THE ANSWER.
 *
 * The entry screen does not want a predicate - it lists the disputes raised
 * against this entry, open and resolved, because the log is the record while
 * the count is a to-do list. It had the identical defect: `(disputes.data ??
 * [])` filtered to nothing on a failed read, and `{flagged.length > 0 && ...}`
 * then removed the whole Disputes section, so a resident who opened an entry
 * specifically TO read a dispute was shown a screen with no disputes on it.
 *
 * The match must not be reimplemented here. The route's own version compared
 * one dispute's payee at a time against the entry's, which happens to agree
 * with `disputedBy` today and is a second copy of the rule that will not stay
 * in step with it - so the rows are selected with `disputedBy` itself and the
 * result is a filter over the same predicate.
 */

/** The disputes raised against one entry, and whether that could be read. */
export type EntryDisputes =
  | { kind: 'ready'; rows: readonly DisputeRow[] }
  | { kind: 'pending' }
  | { kind: 'unknown' }

/**
 * Every dispute naming one entry - by sequence or by payee, open or resolved.
 *
 * `is_open` is NOT filtered here. The section lists resolved disputes too,
 * and only the chip above it counts the open ones; dropping the resolved rows
 * would delete part of an append-only log from the one screen that shows it.
 *
 * Resolved disputes do not make `disputedBy` claim an entry, so a resolved
 * dispute naming a PAYEE cannot be found through the predicate. It is matched
 * directly, by the same two rules, which is why this does not simply filter
 * `rows` through `is`.
 */
export function entryDisputes(q: DisputeQuery, entry: LedgerRow): EntryDisputes {
  if (q.isError) return { kind: 'unknown' }
  if (q.isPending || q.data === undefined) return { kind: 'pending' }
  const payee = entry.counterparty?.toLowerCase()
  const rows = q.data.filter(
    (d) => d.target_seqs.includes(entry.seq) || (!!payee && !!d.counterparty && d.counterparty.toLowerCase() === payee),
  )
  return { kind: 'ready', rows }
}
