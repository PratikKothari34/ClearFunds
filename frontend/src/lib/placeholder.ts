import type { Role, Viewer } from './types'

/**
 * The stand-in for the authenticated viewer, until the session
 * endpoint exists.
 *
 * ONE PLACE, because two placeholders for one fact is a bug rather
 * than a duplication. `/my-flat` read `devDues()[1]` while the root
 * gave the placeholder resident a different flat number, so the page
 * rendered a neighbour's billed, paid and outstanding amounts under
 * the heading "Your flat", directly above the line "Other residents
 * cannot see this." An array index returns somebody for any list long
 * enough, so there was no mismatch to notice.
 *
 * In `lib/` and not in the root route: a rule two surfaces depend on
 * cannot be tested without mounting a router while it lives in a route
 * file, and exporting a non-component from a route also makes every
 * build warn. This is the whole of what both surfaces share.
 *
 * DELETED AT CUTOVER, as one file.
 */

/**
 * Role is `treasurer` deliberately: its item list overflows the mobile
 * bar, so developing against it keeps the overflow path visible
 * instead of discovered later.
 *
 * It is not the ONLY role that overflows — secretary has the same six
 * items against a five-slot bar. Treasurer is chosen because it is
 * also the role that reaches the most surfaces, so one placeholder
 * exercises both the overflow and the widest menu.
 */
export const PLACEHOLDER_ROLE: Role = 'treasurer'

/**
 * A-704, and it must be a flat the fixture actually carries.
 *
 * It is the partly-paid dues row AND it has a question in the flag
 * log, so both bands on `/my-flat` render their populated state in
 * development. A placeholder pointing at a flat with no data turns
 * every band into its empty state and the surface stops being
 * developed against.
 */
export const PLACEHOLDER_FLAT = 'A-704'

/**
 * A flat number belongs to a resident and to nobody else.
 *
 * The type makes `flat` optional because an auditor has none, and the
 * rule behind that is the one that shapes every payload here: a field
 * a viewer may not see is ABSENT, not present-and-hidden. Building the
 * placeholder the same way means switching to the auditor view
 * actually exercises the missing-flat path, rather than passing a flat
 * that the auditor's screens happen not to read.
 */
export function placeholderViewer(role: Role): Viewer {
  return {
    role,
    handle: 'you',
    societyName: 'Sunrise CHS',
    ...(role === 'resident' ? { flat: PLACEHOLDER_FLAT } : {}),
  }
}
