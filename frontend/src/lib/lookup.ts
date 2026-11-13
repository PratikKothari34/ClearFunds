/**
 * What state is a single-row lookup in?
 *
 * `dues.data?.find(...)` returns `undefined` for THREE different situations,
 * and `/my-flat` rendered all three as a loading skeleton:
 *
 *   - the read is still in flight            -> genuinely loading
 *   - the read FAILED                        -> a skeleton that never resolves
 *   - the read succeeded, the row is absent  -> a skeleton that never resolves
 *
 * The last two are the bug. A resident opening their own flat page saw the
 * shimmer forever: nothing throws, nothing logs, no retry is offered, and a
 * permanent skeleton is indistinguishable from a slow network - so the
 * resident waits, reloads, and waits again.
 *
 * The absent-row case is reachable, not theoretical. The server owns the row
 * filter, so an open tenure whose dues row the policy does not return lands
 * here - the same shape as the scope rule - as does a flat removed from the
 * dues table while its tenure stands.
 *
 * Four states, because "absent" and "failed" are different things to say:
 * one asks the resident to try again, the other tells them the figure is not
 * there and who to ask. Neither may be drawn as progress.
 */
export type Lookup<T> =
  | { state: 'loading' }
  | { state: 'failed'; error: unknown }
  | { state: 'absent' }
  | { state: 'found'; row: T }

/**
 * `pending` and `error` come from the query; `row` is the result of looking
 * the wanted row out of its data.
 *
 * Order matters and is asserted. A row IN HAND wins over every query flag: a
 * background refetch sets `isPending` again, and a figure already read must
 * not blink back to a skeleton - nor to an error if that refetch fails, since
 * the figure on screen was really read. Then `failed` before `absent`,
 * because a read that did not happen has not established that anything is
 * missing: calling it absent would assert, from no data, that this flat has
 * no dues row at all.
 */
export function lookup<T>(
  q: { isPending: boolean; isError: boolean; error?: unknown },
  row: T | null | undefined,
): Lookup<T> {
  if (row != null) return { state: 'found', row }
  if (q.isPending) return { state: 'loading' }
  if (q.isError) return { state: 'failed', error: q.error }
  return { state: 'absent' }
}
