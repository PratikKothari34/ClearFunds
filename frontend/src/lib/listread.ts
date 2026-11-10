/*
 * A LIST THAT COULD NOT BE READ IS NOT AN EMPTY LIST.
 *
 * The third time this defect was found in the tree it stopped being worth
 * fixing one surface at a time. `routes/ledger.tsx` had it for disputes,
 * `routes/entry.$seq.tsx` for the same list one screen deeper, and
 * `routes/committee.tsx` for auditor appointments. The sweep in
 * `settled.sweep.test.ts` then named four more, all the same two lines:
 *
 *     const rows = (q.data ?? [])
 *     {rows.length ? <list/> : <p>Nothing here yet.</p>}
 *
 * `q.data` is `undefined` while a read is in flight AND after it has failed,
 * so the coalesce turns both into a confident empty list, and the screen
 * makes a statement about the society from no data. The claim is the bug, not
 * the coalesce: "no payments recorded", "no entries yet" and "nothing needs
 * you" are assertions, and they may only be reached once the read has
 * actually succeeded.
 *
 * Same family as `badgeCount` (a count that could not be read is not zero)
 * and `countable` (`null <= 0` is true, so an unreadable arrears figure took
 * the same branch as a flat that had paid). Three outcomes, never two.
 *
 * ERROR IS CHECKED BEFORE THE DATA. TanStack Query keeps the last successful
 * rows across a failed background refetch, so `isError` can arrive with rows
 * in hand; reporting those as ready presents a stale answer as a current one.
 *
 * There is deliberately no `rows` field on the pending or failed states, and
 * no empty array to fall back on. A caller that could reach `.rows` in those
 * states would write exactly the silence this module exists to remove.
 */

export type ListRead<T> =
  /** The read succeeded. `rows` is what arrived - possibly empty, which is a real answer. */
  | { kind: 'ready'; rows: readonly T[] }
  /** Still arriving. Nothing may be claimed yet. */
  | { kind: 'pending' }
  /** The read failed. Nothing may be claimed, and the surface must say so. */
  | { kind: 'unknown' }

/** The three flags every TanStack query exposes, and nothing else. */
export type ReadFlags<T> = {
  data: readonly T[] | undefined
  isPending: boolean
  isError: boolean
}

export function listRead<T>(q: ReadFlags<T>): ListRead<T> {
  if (q.isError) return { kind: 'unknown' }
  if (q.isPending || q.data === undefined) return { kind: 'pending' }
  return { kind: 'ready', rows: q.data }
}

/**
 * The same decision, with the rows transformed once they have arrived.
 *
 * Most of these sites filter, slice or reverse before rendering, and doing
 * that to `data ?? []` is where the defect lives: the transform runs over the
 * fallback and produces a confident empty list. Here it runs only on `ready`,
 * so there is no way to express the broken order.
 */
export function listReadMap<T, U>(q: ReadFlags<T>, f: (rows: readonly T[]) => readonly U[]): ListRead<U> {
  const r = listRead(q)
  return r.kind === 'ready' ? { kind: 'ready', rows: f(r.rows) } : r
}

/**
 * The same decision over a value DERIVED from one or more reads.
 *
 * `NeedsYou` on the dashboard builds one list out of six queries, so there is
 * no single `data` to hand over. The items are already computed; what the
 * card needs is whether it is entitled to say "nothing needs you", and it is
 * not if ANY contributing read failed or is still in flight.
 *
 * Pessimistic on purpose, in that order: a dashboard that shows three of four
 * obligations and announces the set is complete is worse than one that says
 * it is still looking. A treasurer reads that card to decide they are done.
 */
export function derivedRead<T>(rows: readonly T[], reads: readonly { isPending: boolean; isError: boolean }[]): ListRead<T> {
  if (reads.some((r) => r.isError)) return { kind: 'unknown' }
  if (reads.some((r) => r.isPending)) return { kind: 'pending' }
  return { kind: 'ready', rows }
}

/**
 * Whether a surface may state that there is nothing.
 *
 * The one question every one of these sites was getting wrong, in one place
 * so it is answered the same way everywhere: only a read that actually
 * arrived, and actually held nothing, earns the empty sentence.
 */
export function mayClaimEmpty<T>(r: ListRead<T>): boolean {
  return r.kind === 'ready' && r.rows.length === 0
}
