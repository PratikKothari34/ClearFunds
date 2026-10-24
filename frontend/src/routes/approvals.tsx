import { createFileRoute } from '@tanstack/react-router'
import { Amount } from '../components/Amount'
import { Band } from '../components/Band'
import { BandFallback } from '../components/BandFallback'
import { formatMoney } from '../lib/money'
import type { PendingApproval } from '../lib/types'
import { formatDate } from '../lib/dates'
import { devApprovals } from '../lib/devData'
import {
  approvalFault,
  approvalsRemaining,
  isFullyApproved,
} from '../lib/approval'
import { canSeeApprovalQueue } from '../lib/identity'
import { useViewerRole } from '../lib/viewer'

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
 * Nothing here may NARRATE an approval reduced to one person. The
 * header used to claim this page "would have no way to express it",
 * which was false: it expressed it by interpolating the count, so a
 * payload carrying `approvalsRequired: 1` rendered "so it needs 1
 * committee members" beside a working Approve button. Validity is
 * enforced server-side; `approvalFault` is what stops this page
 * describing an invalid approval as if it were the rule.
 */
function Approvals() {
  const role = useViewerRole()
  const pending = devApprovals()

  /*
   * Checked before the list is read, because `nav.ts` omitting the
   * item is COSMETIC by its own admission and a typed URL skips the
   * menu. What this page puts on screen is every payee, narration and
   * amount one signature short, the limit in force, and who raised it
   * - the committee's working state, not the record.
   */
  if (!canSeeApprovalQueue(role)) {
    return (
      <Band>
        <h2 className="font-serif text-head font-normal mt-0 mb-(--cf-s1)">
          The approval queue is not shown here
        </h2>
        <p className="m-0 text-ink-quiet max-w-[68ch]">
          Expenses waiting for approval are visible to the committee members
          who approve them. Everything that has been approved is in the
          ledger, with who approved it and when.
        </p>
      </Band>
    )
  }

  /*
   * ABSENT IS NOT EMPTY. "Nothing is waiting for approval." is a
   * statement that the committee is clear — the single sentence a
   * treasurer would act on by closing the page. A failed read must
   * never produce it: an expense needing a signature would sit
   * invisible while the product said there was nothing to do.
   */
  if (pending === null) {
    return (
      <BandFallback
        heading="Pending approvals could not be loaded"
        headingId="cf-approvals-absent"
        explanation="This list did not load, so it is not shown. It does NOT mean nothing is waiting for approval — check again before assuming the committee is clear. Nothing has been approved or recorded."
      />
    )
  }

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
  /*
   * The counts are checked before any sentence is built from them.
   *
   * `remaining = required - approved` was computed bare, and `remaining
   * > 0` is false for NaN, so a malformed count took the else branch
   * and printed the green "Ready to be recorded." for an expense with
   * no approvals at all.
   */
  const fault = approvalFault(item)
  const remaining = approvalsRemaining(item)

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
            {/*
             * Pluralised, but the plural was never the bug: the floor
             * in `approvalFault` is. "1 committee members" was the
             * visible symptom of a page willing to say one person is
             * enough.
             */}
            committee {item.approvalsRequired === 1 ? 'member' : 'members'}.
          </>
        )}
      </p>

      <p className="mt-(--cf-s1) mb-0 text-meta">
        <span className="cf-tabular">{item.approvedCount}</span> of{' '}
        <span className="cf-tabular">{item.approvalsRequired}</span> approvals
        so far.{' '}
        {isFullyApproved(item) ? (
          <span className="text-credit">Ready to be recorded.</span>
        ) : (
          <span className="text-attention">
            <span className="cf-tabular">{remaining}</span> still needed.
          </span>
        )}
      </p>

      {/*
       * A faulted approval says so and offers no button.
       *
       * `--break`, not `--attention`: this is not an expense waiting on
       * someone, it is the record disagreeing with the rule. The copy
       * names the rule rather than the field, because the admin reading
       * it cannot act on a field name and the committee needs to know
       * the approval cannot be relied on.
       */}
      {fault !== null ? (
        <p className="mt-(--cf-s2) mb-0 text-meta text-break max-w-[68ch]">
          This item cannot be approved here: the approvals it reports do not
          match the society&rsquo;s rule that no expense is cleared by one
          person alone. Nothing has been recorded. Ask the committee to check
          it before anyone approves.
        </p>
      ) : (
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
      )}
    </Band>
  )
}
