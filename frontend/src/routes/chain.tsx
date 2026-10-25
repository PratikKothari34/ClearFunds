import { createFileRoute } from '@tanstack/react-router'
import {
  AwaitingData,
  PageHeader,
  Panel,
  ProofBand,
  SplitLayout,
  Steps,
  Toolbar,
} from '../components/Page'

export const Route = createFileRoute('/chain')({
  component: ChainPage,
})

/*
 * THE RECORD CHECK - what the export calls the "Append Block Explorer".
 *
 * Everything fabricated in the export is gone. It shipped hard-coded
 * fingerprints (0x7e2f...91a4, BLKHASH: 9bc4...091e) and a peer count
 * reading "NODE PEERS 4 / 4 ONLINE".
 *
 * THERE ARE NO PEERS. Integrity here does not rest on a network of nodes
 * agreeing; it rests on each entry being chained to the one before it and on
 * the latest fingerprint being published outside the committee's control, to
 * recipients who keep their own copies. A peer count would advertise a
 * stronger trust model than the one that exists.
 *
 * And a fabricated fingerprint is indistinguishable from a real one. This
 * screen will be screenshotted and shown at an AGM, so it shows no
 * fingerprint until it has a real one.
 *
 * The honest claim is that the record CANNOT BE CHANGED QUIETLY - never that
 * it cannot be forged by whoever runs the server.
 */

function ChainPage() {
  return (
    <div>
      <PageHeader
        group="Fiduciary Governance"
        page="Record Check"
        title="Record Check"
        subtitle="How this ledger proves it was not altered"
        chips={[
          { label: 'Entries', value: 'Not loaded' },
          { label: 'Last compared', value: 'Never' },
        ]}
      />

      {/*
        The export's proof banner, carrying a 64-character hash, a Polygon
        transaction link and "COLLISION RISK: ZERO (2^-256)".

        The band is kept. The hash is not - there is no published fingerprint
        yet, and a fabricated one is indistinguishable from a real one on a
        screen built to be screenshotted at an AGM. The band says which fact
        is missing, in the place that fact will appear.
      */}
      <ProofBand eyebrow="Published fingerprint">
        <p className="font-label-code-lg text-label-code-lg text-on-primary-container">
          Not yet published
        </p>
        <p className="font-body-sm text-body-sm leading-relaxed text-on-primary-container">
          Once a fingerprint of this ledger is published outside the
          committee's control, it appears here with the date it was published
          and the date this ledger was last compared against it. Two dates,
          never a single status word - one of them going stale is the thing
          worth noticing.
        </p>
      </ProofBand>

      <Toolbar placeholder="Look up an entry by number, flat or payee" />

      <SplitLayout
        main={
          <>
            <Panel
              title="Published fingerprint"
              footnote="Two dates are reported, not a status word: when the fingerprint was published, and when this ledger was last compared against it. A single green tick would hide which of the two is stale."
            >
              <AwaitingData
                what="No fingerprint has been published to this ledger yet."
                contract="The check needs the published fingerprint, the date it was published, and the date of the comparison. Until all three are present this screen shows nothing rather than a reassuring placeholder."
              />
            </Panel>

            <Panel title="Entry fingerprints">
              <AwaitingData
                what="Per-entry fingerprints are not connected yet."
                contract="Each entry carries its own fingerprint and the fingerprint of the entry before it, which is what makes a change in the middle of the history detectable."
              />
            </Panel>
          </>
        }
        rail={
          <>
            {/*
              The export's "Verify Without Trusting ClearFunds" card, with
              its numbered steps. Numbered because this IS a sequence - each
              step depends on the one before it.

              The export's steps fetch a .json from api.clearfunds.in and
              match it against a Polygon witness. Neither exists. These are
              the steps that will actually apply, stated as what they will
              be rather than as something already available.
            */}
            <Panel eyebrow="Independent check" title="Checking without trusting us">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Every flat owner and the society's auditor will be able to
                check this ledger themselves, without taking our word for it.
              </p>
              <Steps
                steps={[
                  {
                    title: 'Take the published fingerprint',
                    body: 'Published on a schedule to people outside the committee, who keep their own copies. That copy is the one that matters - not ours.',
                  },
                  {
                    title: 'Recompute it from the entries',
                    body: 'The fingerprint is derived from the entries themselves, so it can be recomputed from a downloaded copy of the ledger.',
                  },
                  {
                    title: 'Compare the two',
                    body: 'If they differ, an entry changed after it was published. That is the whole check, and it does not require trusting the committee or us.',
                  },
                ]}
              />
            </Panel>

            <Panel title="What this does prove">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Each entry is linked to the one before it. Changing or
                removing an old entry breaks every link after it, so the
                record cannot be altered quietly - any change shows up.
              </p>
            </Panel>

            <Panel title="What it does not prove">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                This record is tamper-evident, not tamper-proof. The two are
                different claims and only the first is true here.
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Whoever runs the server could write an entry that looks
                properly approved. What they cannot do is change an entry
                after the fingerprint covering it has been published
                elsewhere. The published copies are the safeguard, which is
                why they are a requirement and not an extra.
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                A chain also cannot show that something is missing. It proves
                nothing was altered, not that everything was recorded.
              </p>
            </Panel>
          </>
        }
      />
    </div>
  )
}
