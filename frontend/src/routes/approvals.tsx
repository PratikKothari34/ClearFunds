import { createFileRoute } from '@tanstack/react-router'
import {
  AwaitingData,
  PageHeader,
  Panel,
  ProofBand,
  SplitLayout,
  Toolbar,
} from '../components/Page'
import { ApprovalQueue } from '../components/ApprovalQueue'
import { SAMPLE_APPROVALS, SAMPLE_DATA_ON } from '../lib/sample'

export const Route = createFileRoute('/approvals')({
  component: ApprovalsPage,
})

/*
 * THE APPROVAL DESK.
 *
 * The export's skeleton is kept - a queue in the wide column, the rules in
 * the rail. What is NOT kept is its signing panel: "Committee Passphrase /
 * Hardware Key PIN", "Apple Secure Enclave", "Browser WebAuthn",
 * "ECDSA secp256k1".
 *
 * Signing keys are SERVER-HELD. The frontend holds no key material and
 * performs no signing. Device-held keys were rejected because key loss is
 * realistic for volunteer committee members and every recovery story
 * reintroduces a shared secret. A passphrase field here would be a lie
 * about where the trust sits, and would train admins to type a credential
 * into a page that has no use for one.
 */
function ApprovalsPage() {
  return (
    <div>
      <PageHeader
        group="Statutory Register"
        page="Approval Desk"
        tag="Bye-Law 142"
        title="Approval Desk"
        subtitle="Entries awaiting a second signature"
        chips={[
          {
            label: 'Waiting',
            value: SAMPLE_DATA_ON
              ? String(SAMPLE_APPROVALS.length)
              : 'Not loaded',
          },
          { label: 'Your signature needed', value: 'Not loaded' },
        ]}
      />

      <ProofBand eyebrow="Who may approve">
        <p className="font-headline-md text-headline-md text-on-primary">
          No entry is approved by one person
        </p>
        <p className="font-body-sm text-body-sm leading-relaxed text-on-primary-container">
          At or below the committee’s rupee limit an entry needs the treasurer and the secretary, both. Above it, and to change the limit itself, it needs at least two thirds of the committee, rounded up. The limit that applied when an entry was raised is the one it is checked against.
        </p>
      </ProofBand>

      <Toolbar placeholder="Look up a pending entry by number, payee or amount" />

      <SplitLayout
        main={
          <Panel title="Waiting for approval">
            {SAMPLE_DATA_ON ? (
              <ApprovalQueue approvals={SAMPLE_APPROVALS} />
            ) : (
              <AwaitingData
                what="The approval queue is not connected yet."
                contract="It will list each pending entry with its amount, who has already approved it, and how many more approvals its tier requires."
              />
            )}
          </Panel>
        }
        rail={
          <>
            <Panel title="How many approvals an entry needs">
              <dl className="flex flex-col gap-space-md">
                <div>
                  <dt className="font-body-md text-body-md font-semibold text-on-surface">
                    At or below the committee&apos;s limit
                  </dt>
                  <dd className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                    The treasurer <strong>and</strong> the secretary. Both, not
                    either.
                  </dd>
                </div>
                <div>
                  <dt className="font-body-md text-body-md font-semibold text-on-surface">
                    Above the limit
                  </dt>
                  <dd className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                    At least two-thirds of the committee, rounded up. On a
                    committee of thirteen that is nine. The same applies to
                    changing the limit itself.
                  </dd>
                </div>
                <div>
                  <dt className="font-body-md text-body-md font-semibold text-on-surface">
                    Cancelling an entry
                  </dt>
                  <dd className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                    Needs at least as many approvals as the entry it cancels. A
                    cancellation that was easier than the original would be a
                    way around the limit.
                  </dd>
                </div>
              </dl>
            </Panel>

            <Panel
              title="Signing"
              footnote="Your approval is signed on the server on your behalf. There is no key or passphrase to keep on this device, and nothing here will ever ask you for one."
            >
              <AwaitingData
                what="Approving is not connected yet."
                contract="Approval will be an authenticated request; the server signs and appends. The browser never holds key material."
              />
            </Panel>
          </>
        }
      />
    </div>
  )
}
