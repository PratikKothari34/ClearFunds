/**
 * The development half of the fixture gate.
 *
 * Re-exports `lib/sample.ts` unchanged. `vite.config.ts` aliases this
 * module path to `devData.empty.ts` for a production build, so this
 * file - and the fixture behind it - is absent from the module graph
 * there. See `devData.ts` for why the swap is an alias and not an
 * `import.meta.env.DEV` branch.
 */

export {
  SAMPLE_ADJUSTING,
  SAMPLE_ANCHOR,
  SAMPLE_APPROVALS,
  SAMPLE_AUDIT_YEARS,
  SAMPLE_DASHBOARD,
  SAMPLE_DUES,
  SAMPLE_FLAG_LOG,
  SAMPLE_LEDGER,
  SAMPLE_REPORTS,
  SAMPLE_SIGNOFF,
} from './sample'
