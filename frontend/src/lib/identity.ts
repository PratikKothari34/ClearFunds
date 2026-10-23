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
