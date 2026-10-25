/**
 * The production half of the fixture gate. Ships no data.
 *
 * `vite.config.ts` aliases `./devData.source` to this file in a
 * production build, so `lib/sample.ts` is not in the module graph at all
 * and cannot be hoisted into any chunk. See `devData.ts` for why the
 * gate is an alias rather than an `import.meta.env.DEV` branch.
 *
 * Every value here is the honest absent one: `null` for each list, an anchor
 * that says the published record was not reached, and `null` for the
 * dashboard, whose fields have no empty form that is not itself a
 * financial claim.
 */

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
 * `null`, NOT `[]`. See devData.ts for the full argument; the short
 * version is that an empty list is a claim about the society and this
 * build has fetched nothing, so it is not entitled to make one. `[]`
 * here produced a built app stating that nothing needs approval and
 * every month is signed off.
 */
export const SAMPLE_LEDGER: readonly Entry[] | null = null
export const SAMPLE_FLAG_LOG: Readonly<
  Record<string, readonly FlagLogItem[]>
> | null = null
export const SAMPLE_APPROVALS: readonly PendingApproval[] | null = null
export const SAMPLE_SIGNOFF: readonly SignoffPeriod[] | null = null
export const SAMPLE_DUES: readonly DuesRow[] | null = null
export const SAMPLE_REPORTS: readonly ReportSummary[] | null = null
export const SAMPLE_AUDIT_YEARS: readonly AuditYear[] | null = null
export const SAMPLE_ADJUSTING: readonly AdjustingEntry[] | null = null

/*
 * `unreachable` with no dates, and never `match`.
 *
 * A fingerprint band claiming the published chain head agrees, having
 * compared nothing, is the product lying about its central security
 * claim on the one screen that exists to support it.
 */
export const SAMPLE_ANCHOR: AnchorStatus = { state: 'unreachable' }

export const SAMPLE_DASHBOARD: DashboardData | null = null

/*
 * The governance fixtures, absent.
 *
 * `SAMPLE_POLICY` is null rather than a zero-seat committee for the
 * same reason the dashboard is: every field of `ApprovalPolicy` is a
 * statement about the society's rule, and a committee of 0 seats
 * needing 0 approvals is not "unknown", it is a claim that nothing
 * needs approving. The roster and the matrix follow the list
 * convention - null, never [].
 */
export const SAMPLE_COMMITTEE: readonly CommitteeSeat[] | null = null
export const SAMPLE_POLICY: ApprovalPolicy | null = null
export const SAMPLE_STRUCTURING: readonly StructuringGroup[] | null = null
export const SAMPLE_MATRIX: readonly MatrixRow[] | null = null
export const SAMPLE_ALLOCATION: AllocationRemainder | null = null
