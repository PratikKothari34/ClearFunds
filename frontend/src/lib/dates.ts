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
 *
 * DAY-MONTH-YEAR with a SHORT MONTH NAME, and both halves are
 * deliberate. Day first is how this audience reads a date. The month as
 * a name rather than a number is because `10/11` is ambiguous between
 * two conventions, and this is a record an auditor reads: a date that
 * can be read as either of two days is not a date.
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
 * Used where the ordering within a day is part of what is being shown:
 * the fingerprint comparison on /verify, and an entry's posted time on
 * its detail page, where two entries on the same day need to be
 * distinguishable. The approval trail is not one of them — it carries
 * no timestamps yet, and will need a per-signature one from the
 * backend before it can.
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

/**
 * Oldest-first by an ISO timestamp, for a to-do list.
 *
 * `Date.parse`, not a string compare. Two ISO timestamps sort
 * lexicographically only while they carry the SAME offset, and the wire
 * contract fixes neither the offset nor whether it is `Z` — today's
 * fixture is uniformly `+05:30`, so a string compare passes every test
 * here and breaks the first time the server emits UTC. The same shape
 * as the sign-off period ids: an ordering that is correct only by
 * accident of formatting.
 *
 * An unparseable timestamp sorts LAST rather than throwing. This drives
 * a to-do list, and a question with a malformed date is still a question
 * somebody is waiting on — dropping it would hide the thing the list
 * exists to surface. NaN is checked explicitly because every comparison
 * against it is false, which would otherwise make the order depend on
 * array position.
 */
export function byTimestampAsc(a: string | undefined, b: string | undefined): number {
  const ta = a === undefined ? NaN : Date.parse(a)
  const tb = b === undefined ? NaN : Date.parse(b)
  const aOk = !Number.isNaN(ta)
  const bOk = !Number.isNaN(tb)
  if (!aOk && !bOk) return 0
  if (!aOk) return 1
  if (!bOk) return -1
  return ta - tb
}
