/**
 * Every date the product puts on screen, formatted in the society's own
 * time zone.
 *
 * THE TIME ZONE IS NOT A PREFERENCE, IT IS AN ACCOUNTING RULE. Without
 * it `toLocaleDateString` uses whatever zone the device is set to, and
 * an entry timestamped 2026-04-01T00:30:00+05:30 renders as 31 Mar 2026
 * to a resident reading from Los Angeles. That is not a cosmetic
 * difference: 31 March and 1 April are in DIFFERENT FINANCIAL YEARS
 * under the Indian financial year, so the same entry appears in the
 * closed year on one screen and the open year on another, and a
 * resident checking an AGM figure against the ledger finds it does not
 * add up. Nothing errors. The two readers simply disagree, and the
 * ledger exists to stop exactly that.
 *
 * The society's books are kept in India, so IST is the correct zone for
 * every reader regardless of where they are sitting. A committee
 * member abroad for the winter and a tenant's family overseas must see
 * the same financial year as the treasurer in the building.
 *
 * It is pinned to a CONSTANT rather than read from config: a zone that
 * can be changed changes which year an entry falls in, retroactively,
 * for amounts that are already approved and already in the chain.
 *
 * This module is the only place in the frontend that formats a date.
 * Eleven route and component files each carried their own identical
 * copy of this function, none of them passing a zone, which is how one
 * fix would otherwise have had to be made eleven times and would have
 * been made in nine.
 */

const SOCIETY_TIME_ZONE = 'Asia/Kolkata'

const DISPLAY_LOCALE = 'en-IN'

/**
 * What a timestamp shows when it cannot be read at all.
 *
 * `new Date('not a date')` is an Invalid Date, and formatting one
 * returns the literal string "Invalid Date" — which went on screen,
 * beside a real amount, in the product whose claim is that the record
 * can be trusted. A dash says "this field did not arrive" and reads as
 * missing data rather than as a broken page.
 */
const UNREADABLE = '—'

function parsed(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * A calendar day: `1 Apr 2026`.
 *
 * Used wherever only the day matters — when an entry was paid, when a
 * question was answered, when dues were counted.
 */
export function formatDate(iso: string): string {
  const d = parsed(iso)
  if (d === null) return UNREADABLE

  return d.toLocaleDateString(DISPLAY_LOCALE, {
    timeZone: SOCIETY_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * A day and a time: `1 Apr 2026, 12:30 am`.
 *
 * Used where the ordering within a day is part of what is being shown —
 * the fingerprint comparison and an entry's approval trail, where two
 * events on the same day need to be distinguishable.
 */
export function formatDateTime(iso: string): string {
  const d = parsed(iso)
  if (d === null) return UNREADABLE

  return d.toLocaleString(DISPLAY_LOCALE, {
    timeZone: SOCIETY_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
