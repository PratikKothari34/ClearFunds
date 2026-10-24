import type { Role } from './types'

/**
 * Who may see who asked a question.
 *
 * The settled rule: residents are ANONYMOUS TO EACH OTHER, while the
 * treasurer, the secretary and the president can see who raised what.
 * A resident has to be able to ask whether the chairman's nephew got the
 * painting contract without the chairman's nephew learning who asked, or
 * the questions stop and the product's whole purpose goes with them.
 *
 * This lives in lib because two surfaces render a handle — the disputes
 * list and an entry's flag history — and a rule enforced in one place
 * and forgotten in the other is the same as no rule. Both call this.
 *
 * It is a DISPLAY rule here and must be enforced again on the server:
 * a handle a resident may not see should not be in the payload at all,
 * for the same reason the Viewer type makes `flat` absent rather than
 * present-and-hidden. Omitting it client-side keeps it off the screen;
 * only the server can keep it out of the response.
 */
export function canSeeFlagAuthor(role: Role): boolean {
  return role === 'treasurer' || role === 'secretary' || role === 'president'
}

/**
 * Whether a role may see every flat's dues, not only its own.
 *
 * The dues page lists each flat with what it owes, under a line that
 * says "Residents see only their own flat." It said that while having
 * no role check at all: switching the viewer to `resident` rendered the
 * full by-flat table, four neighbours' arrears included, on a page
 * asserting the opposite in its own copy.
 *
 * What a flat owes is the most socially loaded figure in the product —
 * a resident behind on maintenance is identifiable by flat number to
 * everyone in the building — so the committee roles that chase payment
 * see it and nobody else does.
 *
 * Deliberately NOT the same predicate as `canSeeFlagAuthor` even though
 * the roles coincide today. They answer different questions, and a
 * later decision that the president may see who asked a question but
 * not who is in arrears must not have to split one function.
 *
 * The client check is depth, not the boundary: a resident who edits
 * their own bundle still cannot make the server send them the table.
 * The server must refuse the payload.
 */
export function canSeeAllDues(role: Role): boolean {
  return role === 'treasurer' || role === 'secretary' || role === 'president'
}

/**
 * Whether this viewer has business on the approval queue.
 *
 * `/approvals` lists, for every expense one signature short: the payee,
 * the narration, the amount, the limit that was in force, and who
 * raised it. `nav.ts` already omits the item for residents and
 * auditors and `counts.ts` already withholds the badge - but `nav.ts`
 * says of itself that its filtering is COSMETIC and that nothing in it
 * is a permission check. A URL typed by hand skips the menu entirely,
 * which is the same hole that was open on `/dues`.
 *
 * A COMMITTEE MEMBER IS INCLUDED, which is why this is written as an
 * exclusion of two roles rather than a list of the three offices.
 * Above the committee-set limit an expense needs N-of-M approvals and
 * the N are committee members, so the queue holds work for them.
 * `nav.ts` gives them the menu item, and a predicate admitting only
 * the office-holders would have pointed that item at a refusal.
 *
 * An auditor is excluded as well as a resident, and that is the less
 * obvious half. An auditor reads the RECORD, which is the signed and
 * chained result; a queue of things not yet approved is the
 * committee's working state and tells him what the committee is
 * arguing about rather than what it decided.
 *
 * Expressed here rather than inline at the call site because
 * `counts.ts` spells the same rule out a second time, and two copies
 * of one rule drift. The client check is depth, not the boundary - the
 * server must refuse the payload.
 */
export function canSeeApprovalQueue(role: Role): boolean {
  return role !== 'resident' && role !== 'auditor'
}

/**
 * Whether a flag was raised from this flat.
 *
 * Exact match, NOT `handle.includes(flat)`. A substring test makes
 * 'Resident B-40' match 'Resident B-402' and 'B-4' match every flat on
 * the fourth floor, so one resident's page would show another's
 * questions — and on the page that tells them only they can see it.
 * Floor-and-unit numbering makes short flat numbers prefixes of longer
 * ones constantly, so this is the normal case rather than an edge one.
 *
 * The handle format is `Resident <flat>`, which the server owns; this
 * compares the flat portion rather than reconstructing the whole string
 * so a change to the prefix does not silently match nothing.
 */
export function isFromFlat(
  authorHandle: string | undefined,
  flat: string | undefined,
): boolean {
  if (!authorHandle || !flat) return false
  const trimmed = authorHandle.trim()
  // Take the last whitespace-separated token: the flat number.
  const token = trimmed.slice(trimmed.lastIndexOf(' ') + 1)
  return token === flat
}
