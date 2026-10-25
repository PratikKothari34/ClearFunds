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
import type {
  AdjustingEntry,
  AllocationRemainder,
  AnchorStatus,
  ApprovalPolicy,
  AuditYear,
  CommitteeSeat,
  DashboardData,
  DuesRow,
  Entry,
  FlagLogItem,
  MatrixRow,
  PendingApproval,
  ReportSummary,
  SignoffPeriod,
  StructuringGroup,
} from './types'

/*
 * WHY THE LISTS RETURN null AND NOT AN EMPTY ARRAY
 *
 * An empty list is a CLAIM, and on these surfaces it is a claim the
 * product has no basis to make. "Nothing to sign. Every month up to now
 * has been signed off." is a statement about the society's compliance.
 * An empty ledger says no money has ever moved. An empty dues table
 * says every flat has paid. None of those is what "the request did not
 * return" means, and every one of them is the kind of false
 * reassurance this product exists to make impossible.
 *
 * The dashboard already settled this for its own payload — `null`, and
 * the route renders the band's failure state — for the identical
 * reason, and the eight lists were the half that was missed. A
 * production build returned `[]` for all of them, so a built app
 * cheerfully asserted that nothing needs approval, nothing is
 * disputed, and the books are current, having fetched nothing at all.
 *
 * `null` makes that unrepresentable: the type forces every route to
 * answer "what if this did not load" separately from "what if it is
 * genuinely empty", which are different sentences on every one of
 * these pages.
 */
/*
 * EVERY RETURN TYPE IS ANNOTATED, and that is load-bearing.
 *
 * `tsc` only ever resolves `./devData.source` — the alias to the empty
 * module is a Vite resolution, invisible to the typechecker. So typing
 * `null` in `devData.empty.ts` alone would constrain nothing: the
 * compiler would infer the fixture's non-null array type, no route
 * would be asked about the absent case, and the check would be dead
 * while looking alive. The annotation here is what both halves are
 * measured against, and it is what makes `devData.empty.ts` compile
 * only if it returns something a route has been forced to handle.
 */
export const devLedger = (): readonly Entry[] | null => source.SAMPLE_LEDGER
export const devFlagLog = (): Readonly<
  Record<string, readonly FlagLogItem[]>
> | null => source.SAMPLE_FLAG_LOG
export const devApprovals = (): readonly PendingApproval[] | null =>
  source.SAMPLE_APPROVALS
export const devSignoff = (): readonly SignoffPeriod[] | null =>
  source.SAMPLE_SIGNOFF
export const devDues = (): readonly DuesRow[] | null => source.SAMPLE_DUES
export const devReports = (): readonly ReportSummary[] | null =>
  source.SAMPLE_REPORTS
export const devAuditYears = (): readonly AuditYear[] | null =>
  source.SAMPLE_AUDIT_YEARS
export const devAdjusting = (): readonly AdjustingEntry[] | null =>
  source.SAMPLE_ADJUSTING

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

/**
 * The committee roster and the rule it answers to.
 *
 * Both null in production. The roster must never degrade to `[]`: an
 * empty committee rendered against a real threshold would say the
 * society has no one able to approve anything, which is a governance
 * emergency the product would be inventing.
 */
export const devCommittee = (): readonly CommitteeSeat[] | null =>
  source.SAMPLE_COMMITTEE
export const devPolicy = (): ApprovalPolicy | null => source.SAMPLE_POLICY

/**
 * Below-limit payments to one payee that together cross the limit.
 *
 * `null` and `[]` are genuinely different here and both are routine:
 * `[]` means the window was examined and nothing crossed, which is the
 * normal month and worth saying. `null` means it was not examined.
 */
export const devStructuring = (): readonly StructuringGroup[] | null =>
  source.SAMPLE_STRUCTURING

export const devMatrix = (): readonly MatrixRow[] | null => source.SAMPLE_MATRIX

/**
 * How an indivisible remainder was shared out.
 *
 * Null when unknown. A remainder of zero is a different statement -
 * "it divided evenly" - and `AllocationNote` renders nothing for it,
 * so the two cases stay distinct without a second flag.
 */
export const devAllocation = (): AllocationRemainder | null =>
  source.SAMPLE_ALLOCATION
