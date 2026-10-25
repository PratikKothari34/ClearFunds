import { createFileRoute } from '@tanstack/react-router'
import { LedgerList } from '../components/LedgerList'
import {
  AwaitingData,
  PageHeader,
  Panel,
  ProofBand,
  SplitLayout,
  Toolbar,
} from '../components/Page'
import { formatPostedAt, type Entry } from '../lib/ledger'
import { formatMoney } from '../lib/money'
import {
  SAMPLE_BALANCE,
  SAMPLE_BALANCE_AS_AT,
  SAMPLE_DATA_ON,
  SAMPLE_ENTRIES,
  SAMPLE_SOCIETY,
} from '../lib/sample'

/*
 * The band copy, as constants rather than inline strings: the two cases
 * share their second sentence, and a copy edit that updates one and not
 * the other is the kind of drift nobody notices.
 */
const LEDGER_ORDER_BLURB =
  'The ledger below shows every entry in the order it was made, including the ones that were later cancelled.'

const SOCIETY_BALANCE_BLURB =
  'The balance is computed on the server from the chained entries and shown here with the entry it last moved on. ' +
  LEDGER_ORDER_BLURB

export const Route = createFileRoute('/')({
  component: LedgerPage,
})

/*
 * THE GENERAL LEDGER - the resident read path, and the lightest route.
 *
 * The list renders from whatever the server returns. While the backend
 * lane is unbuilt it renders SAMPLE entries instead - self-evidently
 * invented ones, under a banner that says so - because an empty ledger
 * cannot be judged for density, column widths or whether a reversed pair
 * reads correctly, and those are the things this screen has to get right.
 *
 * The record-check panel stays empty even so. Every other sample value
 * announces itself as fake on sight; a 64-character hash cannot.
 */
function LedgerPage() {
  const entries: readonly Entry[] = SAMPLE_DATA_ON ? SAMPLE_ENTRIES : []
  const balance = SAMPLE_DATA_ON ? formatMoney(SAMPLE_BALANCE) : null
  const movedOn = SAMPLE_DATA_ON ? formatPostedAt(SAMPLE_BALANCE_AS_AT) : null

  /*
   * Spread rather than `subtitle={cond ? x : undefined}`: under
   * `exactOptionalPropertyTypes` an absent prop and one explicitly set
   * to undefined are different types, and the component asks for absent.
   */
  const subtitleProp = SAMPLE_DATA_ON
    ? { subtitle: SAMPLE_SOCIETY + ' Ltd.' }
    : {}

  return (
    <div>
      <PageHeader
        group="Statutory Register"
        page="General Ledger"
        tag="Maharashtra Co-Op Compliant"
        title="General Ledger"
        {...subtitleProp}
        chips={[
          {
            label: 'Entries',
            value: SAMPLE_DATA_ON ? String(entries.length) : 'Not loaded',
          },
          {
            label: 'Running balance',
            value: balance === null ? 'Not loaded' : balance,
          },
        ]}
      />

      <ProofBand eyebrow="Society balance">
        <p className="cf-tabular font-headline-md text-headline-md text-on-primary">
          {balance === null ? 'Not loaded' : balance}
        </p>
        <p className="font-body-sm text-body-sm leading-relaxed text-on-primary-container">
          {movedOn === null
            ? SOCIETY_BALANCE_BLURB
            : `Last moved on ${movedOn.date}. ` + LEDGER_ORDER_BLURB}
        </p>
      </ProofBand>

      <Toolbar placeholder="Look up an entry by number, flat, payee or amount" />

      <SplitLayout
        main={<LedgerList entries={entries} />}
        rail={
          <>
            <Panel title="Reading this ledger">
              <dl className="flex flex-col gap-space-md">
                <div>
                  <dt className="font-body-md text-body-md font-semibold text-on-surface">
                    Nothing is ever edited or deleted
                  </dt>
                  <dd className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                    A mistake is corrected by adding a new entry that cancels
                    the old one and says why. Both stay on the record, so you
                    can see what changed and when.
                  </dd>
                </div>
                <div>
                  <dt className="font-body-md text-body-md font-semibold text-on-surface">
                    A cancelled entry is shown struck through
                  </dt>
                  <dd className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                    It no longer counts towards the balance. The entry that
                    cancelled it sits directly beneath, with its reason.
                  </dd>
                </div>
                <div>
                  <dt className="font-body-md text-body-md font-semibold text-on-surface">
                    You can query any entry
                  </dt>
                  <dd className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                    Raising a query records it permanently against the entry.
                    It does not change the amount - only the committee can
                    cancel an entry, and never alone.
                  </dd>
                </div>
              </dl>
            </Panel>

            <Panel
              title="Record check"
              footnote="Tamper-evident, not tamper-proof: this shows whether the record has been changed, which is a different claim from being impossible to change."
            >
              <AwaitingData
                what="The published record check is not connected yet."
                contract="It will compare this ledger against the fingerprint published outside the committee's control, and report the two dates it compared rather than a single status word."
              />
            </Panel>
          </>
        }
      />
    </div>
  )
}
