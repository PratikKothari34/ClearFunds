import { createFileRoute } from '@tanstack/react-router'
import {
  AwaitingData,
  PageHeader,
  Panel,
  ProofBand,
  SplitLayout,
  Toolbar,
} from '../components/Page'
import { AuditYears, ClosedYearCorrections } from '../components/AuditTables'
import {
  SAMPLE_ADJUSTMENTS,
  SAMPLE_AUDIT_YEARS,
  SAMPLE_DATA_ON,
  mostSeriousOpinion,
  opinionLabel,
} from '../lib/sample'

export const Route = createFileRoute('/audit')({
  component: AuditPage,
})

/*
 * STATUTORY AUDIT AND AGM REPORT.
 *
 * Confirmed with a practising chartered accountant, and the copy here is
 * load-bearing in a way most interface text is not:
 *
 *   - The auditor gives REASONABLE ASSURANCE, never a guarantee. Nothing may
 *     say he certified, verified or confirmed that the accounts are correct.
 *     Same force as tamper-evident never tamper-proof.
 *   - Opinion severity is clean < qualified < adverse < disclaimer. A
 *     DISCLAIMER IS WORSE than an adverse opinion, which is the opposite of
 *     what the words suggest. The headline is the MOST SERIOUS opinion ever
 *     received - never "most adverse", which is ambiguous under this ranking.
 *   - "Closed" means an auditor signed off. Not a date, not an admin action.
 *     The committee cannot close its own books.
 *   - An adjusting entry against a closed year MUST be disclosed at the AGM;
 *     sitting in the current ledger does not discharge it.
 *   - Never promise a faster audit. The claim is a more transparent one.
 */

const OPINIONS = [
  {
    name: 'Clean',
    meaning: 'The auditor found the accounts fairly presented.',
  },
  {
    name: 'Qualified',
    meaning: 'Fairly presented except for specific matters he names.',
  },
  {
    name: 'Adverse',
    meaning: 'The auditor concluded the accounts are not fairly presented.',
  },
  {
    name: 'Disclaimer',
    meaning:
      'The auditor could not form an opinion at all. This is the most serious of the four, not the mildest.',
  },
] as const

function AuditPage() {
  /*
   * The headline is the MOST SERIOUS opinion ever received, not the latest.
   * `mostSeriousOpinion` ranks by the statutory order, so a qualified year
   * three years back still governs the headline after two clean ones.
   */
  const worst = SAMPLE_DATA_ON ? mostSeriousOpinion(SAMPLE_AUDIT_YEARS) : null
  const latest = SAMPLE_DATA_ON ? SAMPLE_AUDIT_YEARS[0] : undefined

  return (
    <div>
      <PageHeader
        group="Fiduciary Governance"
        page="Statutory Audit & AGM"
        tag="Section 65B"
        title="Statutory Audit & AGM Report"
        subtitle="Balance sheet and profit and loss"
        chips={[
          {
            label: 'Last audited year',
            value: latest === undefined ? 'Not loaded' : latest.year,
          },
          {
            label: 'Opinion',
            value:
              latest === undefined
                ? 'Not loaded'
                : opinionLabel(latest.opinion),
          },
        ]}
      />

      <ProofBand eyebrow="Most serious opinion received">
        <p className="font-headline-md text-headline-md text-on-primary">
          {worst === null ? 'Not loaded' : worst.opinionLabel}
        </p>
        <p className="font-body-sm text-body-sm leading-relaxed text-on-primary-container">
          Opinions run clean, qualified, adverse, disclaimer — least to most serious. Where a society has received more than one, the figure here is the most serious it has ever received, not the most recent.
        </p>
      </ProofBand>

      <Toolbar placeholder="Look up a year, an opinion or a closed-year correction" />

      <SplitLayout
        main={
          <>
            <Panel
              title="Annual report"
              footnote="The report is generated on the server from signed entries. A report assembled in your browser could be altered before anyone read it."
            >
              {SAMPLE_DATA_ON ? (
                <AuditYears years={SAMPLE_AUDIT_YEARS} />
              ) : (
                <AwaitingData
                  what="Report generation is not connected yet."
                  contract="The report's body is the balance sheet and the profit and loss account, both carrying the true and fair wording. Neither is an attachment and neither is optional."
                />
              )}
            </Panel>

            <Panel
              title="Corrections to closed years"
              footnote="Generated, so it cannot be left out of the report."
            >
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                A year that has been audited cannot have its entries cancelled
                inside that year - doing so would invalidate a report already
                filed. The correction is posted in the current period instead,
                and every one of them is named at the AGM with the year it
                corrects, the amount and the reason.
              </p>
              {SAMPLE_DATA_ON ? (
                <ClosedYearCorrections adjustments={SAMPLE_ADJUSTMENTS} />
              ) : (
                <AwaitingData
                  what="No closed-year corrections can be listed yet."
                  contract="Each needs the year it corrects, the amount, and the stated reason. Sitting in the current ledger does not discharge the disclosure."
                />
              )}
            </Panel>
          </>
        }
        rail={
          <>
            <Panel title="What the four opinions mean">
              <dl className="flex flex-col gap-space-sm">
                {OPINIONS.map((o) => (
                  <div key={o.name}>
                    <dt className="font-body-md text-body-md font-semibold text-on-surface">
                      {o.name}
                    </dt>
                    <dd className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                      {o.meaning}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Listed from least to most serious. Where a society has received
                more than one opinion, the headline shows the most serious it
                has ever received.
              </p>
            </Panel>

            <Panel title="What an audit does and does not say">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                An auditor gives reasonable assurance that the accounts are
                fairly presented. He does not certify that they are correct,
                and no audit can rule out everything.
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                A year counts as closed only once an auditor has signed off on
                it. A date passing does not close a year, and neither does any
                action the committee can take on its own.
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                This record does not make an audit faster. It makes it more
                transparent: the auditor sees every entry and every correction
                in the order they were made.
              </p>
            </Panel>
          </>
        }
      />
    </div>
  )
}
