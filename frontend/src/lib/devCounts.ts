import { countsFor, type CountSources } from './counts'
import { devApprovals, devFlagLog, devSignoff } from './devData'
import type { Role } from './types'

/**
 * Badge figures for development, from the fixtures.
 *
 * THE POINT OF THIS FILE IS THAT IT READS THE FIXTURE THROUGH
 * `devData.ts`, which is the one module the production build aliases
 * away. It does not do the gating itself.
 *
 * It used to, and the comment here used to say the
 * `import.meta.env.DEV` gate at its call site was the whole point.
 * That was superseded: a branch cannot remove an import. The literal
 * is substituted and the dead branch IS dropped, but the fixture's
 * `import` statement is hoisted before any of that happens, so the
 * module stayed in the graph and its strings stayed in the chunk. The
 * gate at the call site is now only about which numbers show in
 * development; the data's absence from the bundle is the alias in
 * `vite.config.ts`, documented in `devData.ts`.
 *
 * What the original note got right, and what still holds: `counts.ts`
 * imported these fixtures itself and `__root.tsx` imports `counts.ts`,
 * so every flat's questions, every resident handle and every per-flat
 * dues figure shipped inside the entry chunk that every role downloads
 * on every page load — while `/my-flat` promised residents that only
 * they and the committee could see their own. Nothing real leaked,
 * because the data is invented; the shape was the flaw, and at cutover
 * the same path carries a real payload with no code change to mark the
 * moment. Verified by the bundle check in `npm run verify`, which
 * greps `dist/assets` for resident handles and fails if any survives.
 *
 * It is deleted when the counts endpoint exists. Until then the badges
 * must show real derived figures in development — they were an empty
 * object once, and the one number the product is judged on was never on
 * screen while the shell was built.
 */
export function devCounts(role: Role): Record<string, number> {
  /*
   * AN ABSENT SOURCE OMITS ITS KEY. It does not pass an empty array.
   *
   * `countsFor` gates each figure on `if (sources.flags)`, and an empty
   * array is TRUTHY — so `?? []` would set the count to 0 rather
   * than leaving it out. A zero happens to render no badge today
   * because `NavBadge` returns null at `count <= 0`, but that is a
   * different mechanism two files away: the badge would be silent by
   * accident instead of because the figure is unknown. If that guard
   * ever changed, every nav item would show a confident "0 items need
   * you" built from data that was never fetched.
   *
   * Omitting the key says the one true thing: there is no figure.
   */
  const flags = devFlagLog()
  const approvals = devApprovals()
  const signoff = devSignoff()

  const sources: CountSources = {
    ...(flags === null ? {} : { flags: Object.values(flags).flat() }),
    ...(approvals === null ? {} : { approvals }),
    ...(signoff === null ? {} : { signoff }),
  }
  return countsFor(role, sources)
}
