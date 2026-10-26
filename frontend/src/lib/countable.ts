/*
 * THE ONLY PLACE A RAW SERVER AMOUNT BECOMES A DECISION.
 *
 * Every amount on the wire is `number | null` in database.types.ts, because
 * every column of a Postgres view is typed nullable regardless of what the
 * view actually produces. types.ts declares the same fields `number`, and
 * api.ts bridges the two with `as unknown as` - a cast, which checks nothing
 * at runtime. So the type system says a null cannot arrive and the generated
 * types say it can, and neither statement is enforced anywhere.
 *
 * The contract now says flat_dues amounts are never null (0 when nothing
 * applies). That is the correct guarantee and it is not a reason to skip this
 * check: the premise of the whole verifier is that what the server sends is
 * recomputed rather than trusted, and an unparsed cast is the one place we
 * were still trusting it.
 *
 * What goes wrong without this is NOT a crash, which is why it survived. In
 * JavaScript `null <= 0` is TRUE and `null > 0` is FALSE, so an unreadable
 * arrears figure took exactly the same branch as a flat that had paid in
 * full: the flat vanished from the treasurer's "owing" filter and the count
 * of flats owing came out TOO LOW. A treasurer stops chasing a flat that
 * owes money, and nothing anywhere looks wrong. Meanwhile the same value
 * reaching <Amount> throws RangeError out of money.ts and blanks the screen,
 * so one bad row hides money on one surface and destroys another.
 *
 * Hence three outcomes, never two. A surface must be able to say "this one
 * could not be read" instead of folding it into either answer.
 */

/** A server amount resolved into something a surface may branch on. */
export type Countable =
  | { readable: true; minor: number; owing: boolean }
  | { readable: false }

/*
 * A readable amount is a safe integer, which is exactly what money.ts
 * requires: anything parts() would throw on must not reach it. That rules
 * out null and undefined, NaN, Infinity, a float, a numeric string, and an
 * integer past 2^53 where arithmetic stops being exact.
 */
export function countable(minor: unknown): Countable {
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) return { readable: false }
  return { readable: true, minor, owing: minor > 0 }
}

/** True only when the amount was read AND is greater than zero. */
export function owing(minor: unknown): boolean {
  const c = countable(minor)
  return c.readable && c.owing
}

/**
 * Partition rows by an amount three ways. `unreadable` is returned so a
 * surface can disclose it; dropping it here would recreate the bug this
 * module exists to prevent.
 */
export function partition<T>(
  rows: readonly T[],
  amount: (row: T) => unknown,
): { owing: T[]; settled: T[]; unreadable: T[] } {
  const out = { owing: [] as T[], settled: [] as T[], unreadable: [] as T[] }
  for (const row of rows) {
    const c = countable(amount(row))
    if (!c.readable) out.unreadable.push(row)
    else if (c.owing) out.owing.push(row)
    else out.settled.push(row)
  }
  return out
}
