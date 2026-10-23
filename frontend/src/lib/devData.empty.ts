/**
 * The production half of the fixture gate. Ships no data.
 *
 * `vite.config.ts` aliases `./devData.source` to this file in a
 * production build, so `lib/sample.ts` is not in the module graph at all
 * and cannot be hoisted into any chunk. See `devData.ts` for why the
 * gate is an alias rather than an `import.meta.env.DEV` branch.
 *
 * Every value here is the honest absent one: an empty list, an anchor
 * that says the published record was not reached, and `null` for the
 * dashboard, whose fields have no empty form that is not itself a
 * financial claim.
 */

import type {
  AdjustingEntry,
  AnchorStatus,
  AuditYear,
  DashboardData,
  DuesRow,
  Entry,
  FlagLogItem,
  PendingApproval,
  ReportSummary,
  SignoffPeriod,
} from './types'

export const SAMPLE_LEDGER: readonly Entry[] = []
export const SAMPLE_FLAG_LOG: Readonly<
  Record<string, readonly FlagLogItem[]>
> = {}
export const SAMPLE_APPROVALS: readonly PendingApproval[] = []
export const SAMPLE_SIGNOFF: readonly SignoffPeriod[] = []
export const SAMPLE_DUES: readonly DuesRow[] = []
export const SAMPLE_REPORTS: readonly ReportSummary[] = []
export const SAMPLE_AUDIT_YEARS: readonly AuditYear[] = []
export const SAMPLE_ADJUSTING: readonly AdjustingEntry[] = []

/*
 * `unreachable` with no dates, and never `match`.
 *
 * A fingerprint band claiming the published chain head agrees, having
 * compared nothing, is the product lying about its central security
 * claim on the one screen that exists to support it.
 */
export const SAMPLE_ANCHOR: AnchorStatus = { state: 'unreachable' }

export const SAMPLE_DASHBOARD: DashboardData | null = null
