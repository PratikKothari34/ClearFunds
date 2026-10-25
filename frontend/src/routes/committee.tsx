import { createFileRoute } from '@tanstack/react-router'
import {
  AwaitingData,
  PageHeader,
  Panel,
  ProofBand,
  SplitLayout,
  Toolbar,
} from '../components/Page'
import { CommitteeRoster, LimitPanel } from '../components/CommitteeRoster'
import { formatMoney } from '../lib/money'
import { SAMPLE_COMMITTEE, SAMPLE_DATA_ON, SAMPLE_LIMIT } from '../lib/sample'

export const Route = createFileRoute('/committee')({
  component: CommitteePage,
})

/*
 * THE COMMITTEE, AND THE APPROVAL THRESHOLD.
 *
 * The export calls this "Quorum & Multisig Governance Console" and fills it
 * with a device-key trust model this product rejected: "Apple Secure
 * Enclave", "Browser WebAuthn", "Bound Public Key", "ECDSA secp256k1",
 * "Cryptographic Nonce Expiry". None of it is carried over. Keys are
 * server-held; there is no per-device key to bind and nothing for a resident
 * or admin to enrol.
 *
 * The export's "Consensus floor locked at 8" IS kept in substance, because
 * that part is real: two-thirds of the committee rounded up, as a floor in
 * code rather than a settings default.
 */

function CommitteePage() {
  const limit = SAMPLE_DATA_ON ? formatMoney(SAMPLE_LIMIT.limit) : null

  return (
    <div>
      <PageHeader
        group="Fiduciary Governance"
        page="Committee & Approvals"
        tag="Bye-Law 113"
        title="Committee & Approval Threshold"
        subtitle="Who may approve, and how many"
        chips={[
          {
            label: 'Admins',
            value: SAMPLE_DATA_ON
              ? String(SAMPLE_COMMITTEE.length)
              : 'Not loaded',
          },
          {
            label: 'Approval limit',
            value: limit === null ? 'Not loaded' : limit,
          },
        ]}
      />

      <ProofBand eyebrow="The floor that cannot be lowered">
        <p className="font-headline-md text-headline-md text-on-primary">
          Two thirds, rounded up
        </p>
        <p className="font-body-sm text-body-sm leading-relaxed text-on-primary-container">
          Above the committee’s limit an entry needs at least ceil(2M/3) of the M admins — 4 of 5, 5 of 7, never 3 of 5. The committee can set it higher. It cannot set it lower, and it can never reduce to one person at any limit.
        </p>
      </ProofBand>

      <Toolbar placeholder="Look up a committee member, role or approval" />

      <SplitLayout
        main={
          <>
            <Panel title="Committee members">
              {SAMPLE_DATA_ON ? (
                <CommitteeRoster members={SAMPLE_COMMITTEE} />
              ) : (
                <AwaitingData
                  what="The committee roster is not connected yet."
                  contract="Each member needs their role and the date they took it. Roles are not interchangeable: the treasurer-and-secretary pair is named specifically in the approval rules."
                />
              )}
            </Panel>

            <Panel
              title="The approval limit"
              footnote="The limit that applied at the time is recorded with each entry, so an approval can always be checked against the limit in force when it was made."
            >
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                The committee sets a rupee limit. At or below it, an entry
                needs the treasurer and the secretary. Above it, an entry
                needs at least two-thirds of the committee, rounded up -
                and changing the limit itself needs that same majority.
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                A limit of zero means every entry needs the full majority.
                That is the safe setting, and the default.
              </p>
              {SAMPLE_DATA_ON ? (
                <LimitPanel limit={SAMPLE_LIMIT} />
              ) : (
                <AwaitingData
                  what="The current limit is not connected yet."
                  contract="The limit in force must come from the chain, not from live configuration. Reading it from configuration would let a committee lower it afterwards and make a past approval look legitimate."
                />
              )}
            </Panel>
          </>
        }
        rail={
          <>
            <Panel title="What the threshold can never become">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                No single admin can move this ledger alone. The threshold can
                be raised but never lowered past two-thirds, and the
                treasurer-and-secretary pair is two people whatever the limit
                is set to.
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                This is fixed in the code, not a setting a committee can edit.
              </p>
            </Panel>

            <Panel title="Signing">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Approvals are signed on the server for the admin who approved.
                There is no key held on anyone&apos;s phone or laptop, nothing to
                enrol, and nothing to lose. A committee of volunteers changes
                every year, and every way of recovering a lost personal key
                ends up sharing a secret between people.
              </p>
            </Panel>
          </>
        }
      />
    </div>
  )
}
