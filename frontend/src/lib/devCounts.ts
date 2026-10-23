import { countsFor, type CountSources } from './counts'
import { devApprovals, devFlagLog, devSignoff } from './devData'
import type { Role } from './types'

/**
 * Badge figures for development, from the fixtures.
 *
 * THE POINT OF THIS FILE IS THE `import.meta.env.DEV` GATE AT ITS ONE
 * CALL SITE, not the function.
 *
 * `counts.ts` used to import these fixtures itself, and `__root.tsx`
 * imports `counts.ts`, so every flat's questions, every resident handle
 * and every per-flat dues figure shipped inside the entry chunk that
 * every role downloads on every page load — while `/my-flat` promised
 * residents that only they, the treasurer and the secretary could see
 * their own. Nothing real leaked, because the data is invented; the
 * shape was the flaw, and at cutover the same path carries a real
 * payload with no code change to mark the moment.
 *
 * Isolating the fixture import here means Vite can drop the whole chain
 * from a production build, the same way RoleSwitch disappears. Verified
 * by the bundle check in `npm run verify`, which greps `dist/assets`
 * for resident handles and fails if any survives.
 *
 * It is deleted when the counts endpoint exists. Until then the badges
 * must show real derived figures in development — they were an empty
 * object once, and the one number the product is judged on was never on
 * screen while the shell was built.
 */
export function devCounts(role: Role): Record<string, number> {
  const sources: CountSources = {
    flags: Object.values(devFlagLog()).flat(),
    approvals: devApprovals(),
    signoff: devSignoff(),
  }
  return countsFor(role, sources)
}
