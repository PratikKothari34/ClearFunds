import { createFileRoute } from '@tanstack/react-router'
import {
  AwaitingData,
  PageHeader,
  Panel,
  ProofBand,
  SplitLayout,
  Toolbar,
} from '../components/Page'
import { FlatMatrix } from '../components/FlatMatrix'
import { tally } from '../lib/countable'
import { SAMPLE_DATA_ON, SAMPLE_FLATS } from '../lib/sample'

export const Route = createFileRoute('/maintenance')({
  component: MaintenancePage,
})

/*
 * THE MAINTENANCE MATRIX - which flats have paid.
 *
 * The count of flats in arrears is the figure that drove `countable.ts`:
 * `NaN > 0` is false, so a flat whose arrears figure could not be read took
 * the same branch as a flat that had paid in full, and the count came out
 * TOO LOW - telling a treasurer to stop chasing.
 *
 * So this screen never shows a bare count. It shows paid, outstanding, and
 * COULD NOT BE READ as three separate figures, and it discloses the third
 * even when it is zero, because a count that silently omits it is the bug.
 */
function MaintenancePage() {
  /*
   * Counted here only to fill the header chips. The chips report the same
   * three-way partition the table does - never a bare "N in arrears",
   * which is the claim `countable.ts` exists to stop.
   */
  const counts = tally(SAMPLE_FLATS.map((f) => f.arrears))

  return (
    <div>
      <PageHeader
        group="Statutory Register"
        page="Maintenance Matrix"
        title="Maintenance Matrix"
        subtitle="Per-flat dues and receipts"
        chips={[
          {
            label: 'Flats',
            value: SAMPLE_DATA_ON ? String(counts.total) : 'Not loaded',
          },
          {
            label: 'Could not be read',
            value: SAMPLE_DATA_ON ? String(counts.unreadable) : 'Not loaded',
          },
        ]}
      />

      <ProofBand eyebrow="How these counts are read">
        <p className="font-headline-md text-headline-md text-on-primary">
          Three answers, never two
        </p>
        <p className="font-body-sm text-body-sm leading-relaxed text-on-primary-container">
          Every flat is counted as paid, outstanding, or could not be read. The third is shown even when it is zero: a figure that failed to parse is not a flat that has paid, and folding the two together produces a count that is too low and a treasurer who stops chasing.
        </p>
      </ProofBand>

      <Toolbar placeholder="Look up a flat by number, wing or resident" />

      <SplitLayout
        main={
          <Panel title="By flat">
            {SAMPLE_DATA_ON ? (
              <FlatMatrix flats={SAMPLE_FLATS} />
            ) : (
              <AwaitingData
                what="Flat-by-flat maintenance is not connected yet."
                contract="Each flat needs its outstanding amount as an integer count of minor units plus a currency code, or an explicit null when the figure is unavailable. A zero and an unknown are different answers and must not arrive as the same value."
              />
            )}
          </Panel>
        }
        rail={
          <Panel
            title="How these counts are reported"
            footnote="Paid and outstanding will not always add up to the total number of flats. The difference is the flats whose figure could not be read, and it is shown rather than absorbed."
          >
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              A figure that cannot be read is counted on its own, never folded
              in with the flats that have paid. Treating an unreadable amount
              as settled would understate how much is outstanding and tell the
              treasurer to stop chasing a flat that still owes.
            </p>
          </Panel>
        }
      />
    </div>
  )
}
