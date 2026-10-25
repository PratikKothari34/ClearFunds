import { Icon } from './Icon'
import { formatMoney } from '../lib/money'
import { formatPostedAt } from '../lib/ledger'
import type { SampleApproval } from '../lib/sample'

/*
 * THE APPROVAL QUEUE.
 *
 * Each item says what is waiting, which tier it falls into, and - the part
 * that matters - HOW MANY MORE approvals it needs and from whom it already
 * has them. A queue that shows only "pending" tells an admin nothing about
 * whether their own signature is the one holding it up.
 *
 * There is no Approve button wired to anything. Approving is an
 * authenticated request the server signs on the admin's behalf, and that
 * endpoint does not exist yet. A button that looks live and does nothing
 * is worse than one that says it is not connected.
 */
export function ApprovalQueue({
  approvals,
}: {
  approvals: readonly SampleApproval[]
}) {
  return (
    <ul className="flex flex-col gap-space-md">
      {approvals.map((a) => (
        <ApprovalCard key={a.entryId} approval={a} />
      ))}
    </ul>
  )
}

function ApprovalCard({ approval }: { approval: SampleApproval }) {
  const amount = formatMoney(approval.amount)
  const raised = formatPostedAt(approval.raisedAt)
  const outstanding = approval.approvalsNeeded - approval.approvalsHeld

  return (
    <li className="flex flex-col gap-space-sm rounded-lg border border-outline-variant p-space-md">
      <div className="flex flex-wrap items-start justify-between gap-space-sm">
        <div className="flex min-w-0 flex-col gap-space-xs">
          <span className="font-label-code-sm text-label-code-sm uppercase text-outline">
            Entry #{approval.entryId}
          </span>
          <span className="font-body-md text-body-md font-semibold text-on-surface">
            {approval.description}
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            {approval.counterparty}
            {raised !== null && ` · raised ${raised.date}`}
          </span>
        </div>
        {/*
          Right-aligned so the amounts in a stack of these share an edge and
          can be compared down the column without reading each label.
        */}
        <span className="cf-tabular shrink-0 font-tabular-currency-md text-tabular-currency-md font-semibold text-on-surface">
          {amount ?? 'Amount unreadable'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-space-md gap-y-space-xs border-t border-outline-variant pt-space-sm">
        <span className="font-label-code-sm text-label-code-sm uppercase text-outline">
          {approval.tier}
        </span>
        {/*
          The count is stated in words as well as in the pips, because the
          pips alone are a shape a resident has to decode.
        */}
        <span className="font-body-sm text-body-sm text-on-surface">
          <strong className="font-semibold">
            {approval.approvalsHeld} of {approval.approvalsNeeded}
          </strong>{' '}
          approvals · {outstanding} still needed
        </span>
        <span aria-hidden="true" className="flex items-center gap-[3px]">
          {Array.from({ length: approval.approvalsNeeded }, (_, i) => (
            <span
              key={i}
              className={
                i < approval.approvalsHeld
                  ? 'size-2 rounded-full bg-on-secondary-fixed-variant'
                  : 'size-2 rounded-full bg-outline-variant'
              }
            />
          ))}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-space-xs">
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          Signed by
        </span>
        {approval.signedBy.map((role) => (
          <span
            key={role}
            className="flex items-center gap-space-xs rounded bg-surface-container px-space-xs py-[2px] font-body-sm text-body-sm text-on-surface"
          >
            <Icon name="approvals" className="size-3 shrink-0" />
            {role}
          </span>
        ))}
      </div>
    </li>
  )
}
