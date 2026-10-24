/**
 * The document title for a path.
 *
 * EVERY ROUTE SHARED ONE TITLE, "ClearFunds", set once in `index.html`.
 * That is not a cosmetic gap. The title is what a screen reader
 * announces on navigation in a single-page app, where nothing else
 * signals that the page changed — so a resident moving from the ledger
 * to their own flat heard nothing, and had to go looking for the
 * heading to find out whether the tap worked. It is also every browser
 * tab, every bookmark and every entry in history, all of them identical.
 *
 * ONE TABLE RATHER THAN A `head` PER ROUTE. Fifteen route files each
 * declaring their own title cannot be checked for the gaps that matter
 * — a route with no title, two routes sharing one, a title that does
 * not name the surface — because there is no place where they are all
 * visible. Here they are a value, so the test can assert over the whole
 * set, and a route added without a title is a failure rather than a
 * silent fallback to the society's name.
 *
 * The society's name comes LAST. A tab strip truncates from the right,
 * so "Ledger · ClearFunds" shows the part that differs when six tabs
 * are open; "ClearFunds · Ledger" shows six identical tabs.
 */

/**
 * The suffix every title carries.
 *
 * Not the product's tagline: a title is read aloud on every navigation,
 * so anything beyond the name is repeated dozens of times a session.
 */
export const TITLE_SUFFIX = 'ClearFunds'

/*
 * Keyed by path, most specific first where one path is a prefix of
 * another. `/ledger/flagged` must be found before `/ledger`, which is
 * why this is an ordered list and not an object — object key order is
 * an implementation detail to rely on, and the fallback below would
 * quietly give a sub-tab its parent's title.
 */
const TITLES: readonly (readonly [string, string])[] = [
  ['/ledger/flagged', 'Questions raised'],
  ['/ledger/reversed', 'Corrections'],
  // A single entry. The id is not in the title: it is meaningless to a
  // resident and would make every bookmark unreadable.
  ['/ledger/', 'Entry'],
  ['/ledger', 'Ledger'],
  ['/my-flat', 'Your flat'],
  ['/disputes', 'Questions about entries'],
  ['/approvals', 'Waiting for approval'],
  ['/dues', 'Maintenance dues'],
  ['/reports', 'Reports'],
  ['/sign-off', 'Monthly sign-off'],
  ['/year-end', 'Year-end'],
  ['/verify', 'Check the record'],
  ['/login', 'Sign in'],
  ['/', 'Home'],
]

/**
 * The title for a path, always with the society's name after it.
 *
 * An unknown path gets the name alone rather than the word "Unknown":
 * a path we do not recognise is our gap, not something to narrate to a
 * resident.
 */
export function titleFor(pathname: string): string {
  const found = TITLES.find(([path]) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path),
  )
  return found ? `${found[1]} · ${TITLE_SUFFIX}` : TITLE_SUFFIX
}

/** Every path this table covers, for the test that checks the routes. */
export function titledPaths(): readonly string[] {
  return TITLES.map(([path]) => path)
}
