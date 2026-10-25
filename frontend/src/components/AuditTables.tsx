import { formatMoney } from '../lib/money'
import { formatPostedAt } from '../lib/ledger'
import {
  opinionLabel,
  type SampleAdjustment,
  type SampleAuditYear,
} from '../lib/sample'

/*
 * THE AUDIT TRAIL AND THE AGM DISCLOSURE.
 *
 * Two rules the copy here carries, both confirmed with a practising CA:
 *
 *   - The auditor gives REASONABLE ASSURANCE. Nothing may say he
 *     certified, verified or confirmed the accounts are correct.
 *   - An adjusting entry against a closed year MUST be disclosed at the
 *     AGM with the year it corrects, the amount and the reason. Sitting in
 *     the current ledger does not discharge it, so this section is
 *     generated rather than written - it cannot be left out.
 */
export function AuditYears({ years }: { years: readonly SampleAuditYear[] }) {
  return (
    <ol className="flex flex-col gap-space-sm">
      {years.map((y) => {
        const signed = formatPostedAt(y.signedOffAt)

        return (
          <li
            key={y.year}
            className="flex flex-wrap items-baseline justify-between gap-space-sm rounded border border-outline-variant p-space-sm"
          >
            <div className="flex flex-col gap-space-xs">
              <span className="cf-tabular font-body-md text-body-md font-semibold text-on-surface">
                {y.year}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {/*
                  "signed off on", never "certified" or "verified". The
                  auditor gave an opinion; he did not guarantee the figures.
                */}
                {y.auditor}
                {signed === null ? '' : ` signed off on ${signed.date}`}
              </span>
            </div>
            <span className="font-body-md text-body-md font-semibold text-on-surface">
              {opinionLabel(y.opinion)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function ClosedYearCorrections({
  adjustments,
}: {
  adjustments: readonly SampleAdjustment[]
}) {
  /*
   * An empty list is stated in words. A section that renders nothing is
   * indistinguishable from a section that was omitted, and the whole point
   * of generating this one is that it cannot be omitted.
   */
  if (adjustments.length === 0) {
    return (
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        No entry in the current period corrects a closed year.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-space-sm">
      {adjustments.map((a) => {
        const amount = formatMoney(a.amount)

        return (
          <li
            key={a.entryId}
            className="flex flex-col gap-space-xs rounded border-l-4 border-outline bg-surface-container-low p-space-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-space-sm">
              <span className="font-body-md text-body-md font-semibold text-on-surface">
                Entry #{a.entryId} corrects {a.correctsYear}
              </span>
              <span className="cf-tabular font-tabular-currency-md text-tabular-currency-md font-semibold text-on-surface">
                {amount ?? 'Amount unreadable'}
              </span>
            </div>
            {/*
              The reason is mandatory on the entry and reproduced verbatim
              here. Summarising it would be editing a disclosure.
            */}
            <span className="font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
              {a.reason}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
