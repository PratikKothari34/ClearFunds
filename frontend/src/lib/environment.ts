/**
 * Whether this build can reach a server at all, and what to say when it
 * cannot.
 *
 * ## The failure this exists to end
 *
 * Production rendered a **blank page**. `#root` was empty and the console
 * carried one line: the Supabase pair must be set. The deployed bundle had
 * been built without the two build-time variables.
 *
 * The lazy guard in `supabase.ts` was NOT at fault and had not regressed - it
 * did exactly what it documents, throwing on first use rather than at import.
 * The blank page came from WHERE that first use happens:
 *
 *   - `AuthProvider`'s mount effect calls `supabase.auth.getSession()`, which
 *     is a first property read, so the Proxy builds the client and throws.
 *   - `AuthProvider` is mounted ABOVE `RouterProvider` in `main.tsx`.
 *   - Both render boundaries sit at or below the router: the router's
 *     `defaultErrorComponent` catches a ROUTE's throw, and the root route's
 *     `CatchBoundary` is inside the router.
 *
 * So the throw was above every boundary, React unmounted the tree, and
 * nothing rendered. `main.tsx` already records that a boundary above
 * `RouterProvider` "would catch the same throws and take the entire app down
 * with them - which is what already happens today". This is that today.
 *
 * ## Why a check and not another boundary
 *
 * A boundary cannot help here: it would have to wrap the provider that
 * decides whether to show sign-in, so there is no tree left to render a
 * message into. The environment is also knowable BEFORE anything is
 * attempted - it is two strings read at build time - so asking first is
 * strictly better than throwing and catching.
 *
 * ## What this must never do
 *
 * **Never swallow it and continue.** An app that cannot reach the server must
 * say so. Continuing with no session renders the sign-in screen, and a
 * resident who types a code into a build that can never deliver one is worse
 * off than a resident who is told the build is misconfigured. The same rule
 * that forbids rendering an empty ledger as "no money has ever moved":
 * absence of an answer is not an answer.
 *
 * **Never name the key's value.** The message says which variable is unset,
 * never what it contains, because this string reaches a screen and a screen
 * reaches a screenshot.
 */

/** Read at module scope, as Vite inlines them at build time. */
const URL_SET = Boolean(import.meta.env.VITE_SUPABASE_URL)
const KEY_SET = Boolean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)

export type EnvironmentFault = {
  /** The variables that are unset, in the order a reader should set them. */
  missing: string[]
  /** One sentence naming what is wrong, for a screen. */
  summary: string
}

/**
 * `null` when the build can reach a server, a fault describing what is unset
 * otherwise.
 *
 * Takes its two readings as arguments so a test can drive every combination
 * without rebuilding; the no-argument call is the real one.
 */
export function environmentFault(
  urlSet: boolean = URL_SET,
  keySet: boolean = KEY_SET,
): EnvironmentFault | null {
  const missing: string[] = []
  if (!urlSet) missing.push('VITE_SUPABASE_URL')
  if (!keySet) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY')
  if (!missing.length) return null

  /*
   * Both unset is the ordinary case (nobody set anything); exactly one unset
   * is the interesting one, because it usually means a deploy configured half
   * the environment, and a reader who is told only "Supabase is not
   * configured" will re-check the variable that is already set.
   */
  const names = missing.join(' and ')
  const verb = missing.length === 1 ? 'is' : 'are'
  return {
    missing,
    summary:
      `This build cannot reach the server: ${names} ${verb} not set. ` +
      'They are read when the app is built, so they must be set for this ' +
      'environment and the app rebuilt - setting them without a rebuild ' +
      'changes nothing.',
  }
}
