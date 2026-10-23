/**
 * The one gate between the development fixture and a production build.
 *
 * WHY ONE GATE RATHER THAN FOURTEEN
 *
 * `lib/devCounts.ts` gated the fixture behind `import.meta.env.DEV` for
 * the navigation badges, and that was correct but was not the whole
 * leak. Thirteen route files went on importing `lib/sample.ts` directly
 * and ungated, and because those routes are separate lazy chunks that
 * share one fixture module, the bundler hoisted the fixture to their
 * common parent — the ENTRY chunk. The entire sample ledger, every
 * vendor name, every resident handle and every per-flat dues figure was
 * therefore downloaded by every role, including a signed-out visitor at
 * /login, before anything rendered. Closing one of fourteen doors moved
 * the data; it did not remove it.
 *
 * Caught by `scripts/check-fixtures.mjs` on its first run, which is the
 * argument for that script: the gate looked right in review, the
 * comment in `devCounts.ts` asserted the build was verified, and the
 * only symptom was bytes in a file nobody opens.
 *
 * WHY AN ALIAS AND NOT `import.meta.env.DEV`
 *
 * A branch cannot do this job. `import.meta.env.DEV` is replaced by a
 * literal and the dead branch IS dropped, but the fixture's `import`
 * statement is hoisted to the top of the module before any of that
 * happens, so the module stays in the graph and its strings stay in the
 * chunk. `import.meta.glob` with `eager: true` fails the same way: it
 * is resolved at transform time into real static imports, so wrapping
 * it in a ternary changes nothing. Both were tried and both left the
 * vendor names in the entry chunk.
 *
 * So the swap happens at module resolution instead: `vite.config.ts`
 * aliases `./devData.source` to `./devData.empty.ts` in a production
 * build, and `lib/sample.ts` is then not reachable from any entry at
 * all. That is checkable rather than inferred — `npm run fixtures`
 * greps the built output and fails if a single marker survives.
 *
 * THIS FILE IS DELETED AT CUTOVER. Each accessor becomes the query that
 * replaces it, which is why they are functions rather than re-exported
 * constants: a route already calls something, so the change lands here
 * and not across thirteen files.
 */

import * as source from './devData.source'
import type { AnchorStatus, DashboardData } from './types'

export const devLedger = () => source.SAMPLE_LEDGER
export const devFlagLog = () => source.SAMPLE_FLAG_LOG
export const devApprovals = () => source.SAMPLE_APPROVALS
export const devSignoff = () => source.SAMPLE_SIGNOFF
export const devDues = () => source.SAMPLE_DUES
export const devReports = () => source.SAMPLE_REPORTS
export const devAuditYears = () => source.SAMPLE_AUDIT_YEARS
export const devAdjusting = () => source.SAMPLE_ADJUSTING

/**
 * The published-chain-head comparison.
 *
 * Production returns `unreachable` with no dates, which is the only
 * thing this band may say before the fetch exists: the record was not
 * reached. It must never fall back to `match`.
 */
export const devAnchor = (): AnchorStatus => source.SAMPLE_ANCHOR

/**
 * The dashboard payload, or null.
 *
 * Null in production, and the dashboard must handle it. Every field of
 * `DashboardData` is required — a balance, an as-of date, a period — and
 * none has an honest empty value: a zero balance is a financial claim,
 * and an absent date is not a date. So unlike the lists above, this one
 * cannot degrade quietly; the route renders its data-absent state.
 */
export const devDashboard = (): DashboardData | null =>
  source.SAMPLE_DASHBOARD
