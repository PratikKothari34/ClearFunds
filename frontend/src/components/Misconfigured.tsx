import type { EnvironmentFault } from '../lib/environment'
import { Card } from './ui'

/*
 * What the app shows when the build cannot reach a server at all.
 *
 * This replaced a BLANK PAGE. Production was deployed without the two
 * build-time Supabase variables; `AuthProvider`'s mount effect made the first
 * property read on the lazy client, which threw by design - but `AuthProvider`
 * is mounted above `RouterProvider`, so the throw was above both render
 * boundaries, React unmounted the tree, and `#root` was empty with a single
 * console line to explain it.
 *
 * Deliberately NOT `Crashed`, and the difference is the whole point of having
 * a second screen:
 *
 *   - `Crashed` says the ledger is unaffected and the entry can be read
 *     elsewhere in the app. Here NOTHING can be read anywhere in the app,
 *     because there is no server to read from. Repeating that copy would be a
 *     false reassurance.
 *   - `Crashed` offers a retry. There is nothing transient here: the values
 *     are baked in at build time, so every retry fails identically until
 *     someone rebuilds. A retry button would be a loop with no exit, which is
 *     the same mistake as telling a resident to try again for a crash.
 *
 * It is addressed to whoever can fix it - the person who deployed - not to a
 * resident, because a resident cannot act on it and a misconfigured build is
 * never the state a resident should reach. It still has to read sanely if one
 * does, so it says what is wrong in plain words first and keeps the variable
 * names in a monospace block below, the way `Crashed` surfaces its detail: a
 * resident who screenshots this to the committee is how we find out.
 *
 * It never says the ledger is wrong, missing or empty. The product's claim is
 * about a record nobody can quietly change, and a client that cannot connect
 * knows NOTHING about that record - so it asserts nothing about it. Saying
 * "no entries" here would be the worst available lie: a true statement about
 * this screen and a false one about the society.
 */
export function Misconfigured({ fault }: { fault: EnvironmentFault }) {
  return (
    <div className="mx-auto max-w-md p-6">
      <Card className="p-5">
        <p className="font-medium text-break">This app is not configured.</p>
        <p className="mt-1 text-sm text-ink-2">
          It cannot reach the server, so nothing can be shown or signed in to.
          This is a fault in how the app was built and published - not in the
          ledger, and not something you can fix on this phone. Please tell
          whoever set up the app.
        </p>
        {/*
         * The variable NAMES, never their values. This block reaches a
         * screenshot in a WhatsApp group, and `environment.ts` is tested to
         * keep a key's value out of the sentence for the same reason.
         */}
        <p className="mt-3 break-words rounded-lg bg-sunken p-3 font-mono text-xs text-ink-2">
          {fault.summary}
        </p>
        {/*
         * No retry and no "go to the dashboard": there is no dashboard to
         * reach, and every reload lands back here until the app is rebuilt.
         * An action that cannot work is worse than no action.
         */}
      </Card>
    </div>
  )
}
