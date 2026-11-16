/**
 * WHICH MONTHS THE SIGN-OFF SCREEN MUST OFFER.
 *
 * This is the decision, not the rendering. It lived as `recentMonths(cur, 12)`
 * at the call site in the route, which is why the bug below was never caught:
 * `recentMonths` is well tested - length, strictly descending order, shape,
 * the year rollover - and every one of those tests proves it generates twelve
 * months CORRECTLY. None of them could ask whether twelve is the right set,
 * because the window size was an argument in a route and a route cannot be
 * tested without mounting a router.
 *
 * THE BUG, and it is the serious direction. A rolling twelve months from today
 * DROPS an older month whose sheet was never signed. Not shown as overdue -
 * not shown at all, with nothing to notice, because the list was generated
 * rather than read. A president returning to a society that went quiet for a
 * year is told there is nothing to sign, which is the opposite of the screen's
 * purpose. A sign-off is the president's final say on a month's expense sheet;
 * an unsigned month does not stop being unsigned because time passed.
 *
 * The cosmetic direction matters less but is still wrong: a society two months
 * old rendered ten rows for months before it existed.
 *
 * SO THE MONTH SET IS DERIVED FROM DATA. A month belongs on the screen when
 * the ledger has activity in it, or when it already carries a sign-off. Both
 * come from the server, which is the only party that knows when the society
 * started and what it has posted. The current month is included so the screen
 * is never empty on a society's first day - it is the one month we add, and we
 * add it as the period in progress, never as something overdue.
 *
 * The rolling window is kept only as a FLOOR, so the screen still shows a few
 * recent months in a society whose summary has not loaded or which genuinely
 * has no postings yet. It can only ever ADD months to the set, never remove
 * one, which is the property the old code lacked.
 */

/** A month key, 'YYYY-MM'. */
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export const isMonth = (v: unknown): v is string => typeof v === 'string' && MONTH.test(v)

/**
 * The months to offer, newest first.
 *
 * `activity` is the months the ledger has postings in, `signed` the months
 * already signed off, `floor` a small recent window so the screen is never
 * blank. Anything malformed in any input is DROPPED rather than rendered: a
 * bad month key would otherwise reach `new Date(...)` in the row and throw
 * RangeError out of the render, and this screen sits inside the Shell, so one
 * bad row would take the page rather than the row.
 */
export function signoffMonths(
  activity: readonly unknown[] | undefined,
  signed: readonly unknown[] | undefined,
  floor: readonly string[],
): string[] {
  const set = new Set<string>()
  for (const source of [activity, signed, floor]) {
    for (const m of source ?? []) if (isMonth(m)) set.add(m)
  }
  return [...set].sort().reverse()
}

/**
 * Is this month's sheet waiting on the president?
 *
 * Only a month that has ENDED can be overdue. The current month is in
 * progress, so it is never due, and a future month - which a clock skew or a
 * bad server row could produce - is never due either. `cur` is the current
 * month in the society's reporting timezone, supplied by the caller rather
 * than read from the device here, so this function stays pure and testable.
 *
 * This deliberately answers only "is it waiting", never "may it be signed".
 * Whether an old month is still signable is a ledger rule about open periods,
 * and the browser knows neither the society's timezone nor which period is
 * open - the same mistake as deciding a structuring window from Date.now().
 * When the server states it, this takes it as an input.
 */
export function isDue(month: string, cur: string, signedMonths: ReadonlySet<string>): boolean {
  if (!isMonth(month) || !isMonth(cur)) return false
  if (signedMonths.has(month)) return false
  return month < cur
}

/**
 * WHICH MONTHS THE DASHBOARD MUST PROMPT THE PRESIDENT TO SIGN.
 *
 * The same decision as `signoffMonths`, for the other surface that states it,
 * and it carried the ORIGINAL bug long after the sign-off screen was fixed:
 * the home card generated `recentMonths(cur, 3)` and filtered that, so a sheet
 * left unsigned for more than three months silently left the list. Nothing
 * said it had gone. The sign-off screen still offered it, but the card is the
 * PROMPT - it is what tells a president the screen is worth opening - so an
 * unsigned month aged out of the only place anyone would have seen it, and the
 * dashboard then said "Nothing needs you right now."
 *
 * That is the serious direction, and it is worse here than it was there: on
 * the sign-off screen the month was missing from a list someone had chosen to
 * go and read; here it is missing from the reason to go at all.
 *
 * So the candidates are DERIVED FROM DATA exactly as `signoffMonths` derives
 * them - the months the ledger has activity in, plus the months already
 * signed, with a small rolling window kept only as a floor that can ADD a
 * month and never remove one. `isDue` then decides each one, so the card and
 * the screen answer "is this waiting on me" with one rule rather than two.
 *
 * `limit` caps what the CARD renders, never what is considered: the overflow
 * is counted by the caller and disclosed, the way the approvals block already
 * discloses its own. A cap applied before the decision would be the same bug
 * wearing a different number.
 */
export function signoffDue(
  activity: readonly unknown[] | undefined,
  signed: readonly unknown[] | undefined,
  floor: readonly string[],
  cur: string,
): string[] {
  const signedSet = new Set<string>()
  for (const m of signed ?? []) if (isMonth(m)) signedSet.add(m)
  return signoffMonths(activity, signed, floor).filter((m) => isDue(m, cur, signedSet))
}
