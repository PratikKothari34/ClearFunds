import { Amount } from './Amount'
import { PendingAction } from './PendingAction'
import { Band } from './Band'
import { formatMoney } from '../lib/money'
import { formatDate } from '../lib/dates'
import type { PendingApproval } from '../lib/types'
import {
  approvalFault,
  approvalsRemaining,
  isFullyApproved,
} from '../lib/approval'

/**
 * One expense waiting for approval.
 *
 * It lives here rather than inside the route for one reason: a route
 * file cannot be rendered in a test. `autoCodeSplitting` rewrites every
 * file under `routes/`, splitting the component into a lazy reference,
 * so a test that imports the route's `Route.component` gets TanStack's
 * `Lazy` wrapper and renders an empty container - silently, with the
 * absence assertions passing against ''. The rule this component
 * carries is exactly the kind that must not be left somewhere it
 * cannot be tested.
 *
 * The design rule it carries: every item states WHY it needs the
 * approvals it needs, against the limit that was in force when it was
 * raised. An approval count with no explanation reads as an arbitrary
 * gate, and an admin who does not understand the gate treats it as an
 * obstacle instead of a safeguard.
 *
 * The count and tier come from the server, snapshotted into the chain
 * when the entry was raised. They are never computed here and never
 * read from live settings: a committee that could lower the limit
 * afterwards could retroactively legitimise an approval already given.
 */
export function ApprovalItem({ item }: { readonly item: PendingApproval }) {
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

  /*
   * A FAULTED ITEM IS NEVER NARRATED, only reported.
   *
   * Suppressing the button was half a fix. The two paragraphs below
   * interpolate `approvalsRequired` and `approvedCount` directly, and
   * they rendered whatever the fault was, so a payload carrying
   * `approvalsRequired: 1` printed "so it needs 1 committee member" and
   * — because `approvedCount: 1` satisfies `isFullyApproved` — a green
   * "Ready to be recorded." above a banner saying it could not be
   * approved. That is this page describing a one-person approval as the
   * rule, which the header forbids in exactly those words.
   *
   * The amount, payee and narration stay: an admin needs to recognise
   * WHICH expense is wrong. Only the sentences built from the broken
   * counts are withheld.
   */
  if (fault !== null) {
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
              <span className="whitespace-nowrap">
                {formatDate(item.raisedAt)}
              </span>
            </p>
          </div>
          <Amount value={item.amount} direction={item.direction} />
        </div>

        <p className="mt-(--cf-s2) mb-0 text-meta text-break max-w-[68ch]">
          This item cannot be approved here: the approvals it reports do not
          match the society&rsquo;s rule that no expense is cleared by one
          person alone. How many approvals it claims to need is not shown,
          because that figure is the part that is wrong. Nothing has been
          recorded. Ask the committee to check it before anyone approves.
        </p>
      </Band>
    )
  }

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
       * Reached only on a sound item: the faulted case returned above,
       * which is `--break` rather than `--attention` because it is not
       * an expense waiting on someone, it is the record disagreeing
       * with the rule.
       */}
      <div className="mt-(--cf-s2)">
        {item.viewerHasApproved ? (
          // Stated rather than hidden. A disabled button with no
          // explanation reads as a broken page; an admin then tries
          // again from another device.
          <p className="m-0 text-meta text-ink-quiet">
            You have approved this. It is waiting on others.
          </p>
        ) : (
          /*
            NAMED BY WHAT IT APPROVES. Every row's button read
            "Approve this expense", so a queue of nine expenses gave a
            screen reader nine identical buttons - and this is the one
            control in the product that moves money. Approving the
            wrong row is not a navigation mistake.

            The amount is in the name too, not just the payee: two
            entries to the same payee in one queue is the ordinary
            case, and the amount is what the approver is actually
            being asked about.
          */
          <PendingAction
            srSuffix={`${item.payee}, ${formatMoney(item.amount)}`}
          >
            Approve this expense
          </PendingAction>
        )}
      </div>
    </Band>
  )
}
