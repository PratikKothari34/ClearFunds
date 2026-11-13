/*
 * A DATE THE SERVER WILL REFUSE MUST NOT REACH THE SERVER.
 *
 * `/new` carried `max={todayIST()}` on the date input and nothing read it.
 * The input is not inside a `<form>`, so no implicit validation runs, and the
 * button's `ready` test covered the amount, the payee and the note only. A
 * treasurer could set a date in 2027, see no warning, click Propose with a
 * fully enabled button, and collect a server error for something the screen
 * had already decided was wrong - `rules.sql` refuses `bdate > cf.today()`.
 *
 * Nothing bad is STORED: the server is the authority and it says no. The
 * defect is that the screen holds a `max`, which is a claim to the reader
 * that the control is bounded, while the only thing enforcing the bound is a
 * round trip. An attribute that looks like a guard and decides nothing is the
 * display-guard-answering-a-decision shape: it reads as covered in review,
 * and a reader cannot tell it apart from a real check.
 *
 * So the rule lives here, where it is tested without mounting a router, and
 * the route asks it rather than describing it in markup.
 *
 * WHY THE COMPARISON IS ON STRINGS. Both sides are ISO `YYYY-MM-DD` and the
 * input emits exactly that, so a lexicographic compare is the same ordering
 * as a calendar compare, with no timezone in play. Parsing to `Date` would
 * introduce one: `new Date('2026-11-11')` is UTC midnight, which is still the
 * previous day in IST, so a date entered as today reads as tomorrow on the
 * server's clock. The whole point is to agree with the server about what
 * "today" is, so the only safe move is not to convert at all.
 */

/** Whether `value` is a well-formed ISO calendar date, `YYYY-MM-DD`. */
export function isIsoDate(value: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!parts) return false
  // Read from the match rather than destructuring a split: the pattern has
  // already proven all three groups are present, and the compiler can see it.
  const y = Number(parts[1])
  const m = Number(parts[2])
  const d = Number(parts[3])
  if (m < 1 || m > 12 || d < 1) return false
  // Rejects 31 April and 29 February in a common year, which the pattern
  // alone admits. `Date.UTC` normalises an overflow, so a round trip that
  // does not come back identical was not a real calendar date.
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

export type DateRefusal =
  | { ok: true }
  | { ok: false; reason: 'malformed' | 'future'; message: string }

/**
 * Decide whether a business date may be submitted.
 *
 * `today` is passed in rather than read from the clock so the caller supplies
 * the same value the input's `max` uses, and so this is testable without
 * faking time.
 */
export function checkBusinessDate(value: string, today: string): DateRefusal {
  if (!isIsoDate(value)) {
    return { ok: false, reason: 'malformed', message: 'Pick a date for this entry.' }
  }
  if (!isIsoDate(today)) {
    /*
     * A caller that cannot say what today is cannot be allowed to conclude
     * that a date is fine. Refusing is the safe direction: the server still
     * decides, and the screen has simply not cleared it.
     */
    return { ok: false, reason: 'malformed', message: 'Pick a date for this entry.' }
  }
  if (value > today) {
    return {
      ok: false,
      reason: 'future',
      // Says what to do, not merely that something is wrong.
      message: 'This date is in the future. An entry records money that has already moved, so pick today or earlier.',
    }
  }
  return { ok: true }
}
