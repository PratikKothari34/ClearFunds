import { createFileRoute } from '@tanstack/react-router'
import { Amount } from '../components/Amount'
import { Band } from '../components/Band'
import { formatMoney } from '../lib/money'
import { SAMPLE_APPROVALS } from '../lib/sample'
import type { PendingApproval } from '../lib/types'

export const Route = createFileRoute('/approvals')({
  component: Approvals,
})

/**
 * Entries waiting on approval.
 *
 * The design rule that shapes this page: every item states WHY it needs
 * the approvals it needs, against the limit that was in force when it
 * was raised. An approval count with no explanation reads as an
 * arbitrary gate, and an admin who does not understand the gate treats
 * it as an obstacle instead of a safeguard.
 *
 * The approval count and tier come from the server, snapshotted into
 * the chain when the entry was raised. They are never computed here,
 * and never read from live settings: a committee that could lower the
 * limit afterwards could retroactively legitimise an approval already
 * given.
 *
 * Nothing here can reduce an approval to one person. That is enforced
 * server-side; this page would have no way to express it.
 */
function Approvals() {
  const pending = SAMPLE_APPROVALS

  return (
    <>
      <Band>
        <h2 className="font-serif text-head font-normal mt-0 mb-(--cf-s1)">
          Waiting for approval
        </h2>
        <p className="m-0 text-ink-quiet max-w-[68ch]">
          Nothing is recorded in the ledger until it has the approvals it
          needs. No single person can approve an expense alone.
        </p>
      </Band>

      {pending.length === 0 ? (
        <Band>
          <p className="m-0 text-ink-quiet max-w-[68ch]">
            Nothing is waiting for approval.
          </p>
        </Band>
      ) : (
        pending.map((item) => <ApprovalItem key={item.id} item={item} />)
      )}
    </>
  )
}

function ApprovalItem({ item }: { readonly item: PendingApproval }) {
  const remaining = item.approvalsRequired - item.approvedCount

  return (
    <Band>
      <div className="flex items-baseline justify-between gap-(--cf-s2)">
        <div className="min-w-0">
          <p className="m-0">{item.narration}</p>
          <p className="m-0 text-meta text-ink-quiet">
            <span className="break-words">{item.payee}</span>
            {' · raised by '}
            {item.raisedByHandle}
            {' · '}
            <span className="whitespace-nowrap">{formatDate(item.raisedAt)}</span>
          </p>
        </div>
        <Amount value={item.amount} direction={item.direction} />
      </div>

      {/*
       * The sentence that makes the gate legible. Two tiers, two
       * different sentences, both naming the limit in force at the time
       * rather than the limit today.
       */}
      <p className="mt-(--cf-s2) mb-0 text-meta text-ink-quiet max-w-[68ch]">
        {item.tier === 'both' ? (
          <>
            This is at or below the society&rsquo;s limit of{' '}
            {formatMoney(item.limitInForce)}, so it needs the treasurer and the
            secretary — both of them.
          </>
        ) : (
          <>
            This is above the society&rsquo;s limit of{' '}
            {formatMoney(item.limitInForce)}, so it needs{' '}
            <span className="cf-tabular">{item.approvalsRequired}</span>{' '}
            committee members.
          </>
        )}
      </p>

      <p className="mt-(--cf-s1) mb-0 text-meta">
        <span className="cf-tabular">{item.approvedCount}</span> of{' '}
        <span className="cf-tabular">{item.approvalsRequired}</span> approvals
        so far.{' '}
        {remaining > 0 ? (
          <span className="text-attention">
            <span className="cf-tabular">{remaining}</span> still needed.
          </span>
        ) : (
          <span className="text-credit">Ready to be recorded.</span>
        )}
      </p>

      <div className="mt-(--cf-s2)">
        {item.viewerHasApproved ? (
          // Stated rather than hidden. A disabled button with no
          // explanation reads as a broken page; an admin then tries
          // again from another device.
          <p className="m-0 text-meta text-ink-quiet">
            You have approved this. It is waiting on others.
          </p>
        ) : (
          <button
            type="button"
            className="min-h-11 px-(--cf-s3) border border-rule rounded-sm bg-surface text-ink font-medium"
          >
            Approve this expense
          </button>
        )}
      </div>
    </Band>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
