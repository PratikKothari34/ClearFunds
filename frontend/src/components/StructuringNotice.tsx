import { formatMoney } from '../lib/money'
import type { Money, StructuringGroup } from '../lib/types'

/**
 * Below-limit payments to one payee that together cross the limit.
 *
 * MADE VISIBLE, NEVER BLOCKED. Blocking teaches splitting across
 * payees, which is harder to see; a displayed aggregate costs the
 * splitter the thing they were buying. This is decision 0004's
 * structuring rule, and this component is the first surface for it.
 *
 * IT IS NOT AN ACCUSATION, and the copy is written to avoid becoming
 * one. Three payments to one contractor inside a fortnight is the
 * ordinary way a repair job is billed. What the notice says is that
 * the total crossed the line the society set, so the committee looks
 * at it together — not that anyone did anything wrong. A product that
 * cries fraud at routine billing gets its warnings dismissed by
 * habit, and then says nothing the day it matters.
 *
 * `--cf-attention`, not `--cf-break`: this needs THIS viewer to look.
 * `break` means the record disagrees with itself, which is a
 * different and louder thing.
 */
export function StructuringNotice({
  group,
  limitInForce,
}: {
  readonly group: StructuringGroup
  /** The limit as it stood then, never today's. */
  readonly limitInForce: Money
}) {
  const count = group.entryIds.length

  return (
    <div className="border-s-2 border-tertiary-fixed ps-space-md">
      <p className="m-0">
        <span className="break-words">{group.payee}</span> was paid{' '}
        <span className="cf-tabular">{count}</span>{' '}
        {count === 1 ? 'time' : 'times'} within{' '}
        <span className="cf-tabular">{group.windowDays}</span> days, totalling{' '}
        <span className="cf-tabular">{formatMoney(group.total)}</span>.
      </p>
      <p className="mt-space-sm mb-0 font-label-code-sm text-label-code-sm text-on-surface-variant max-w-[68ch]">
        Each payment was at or below the society&rsquo;s limit of{' '}
        <span className="cf-tabular">{formatMoney(limitInForce)}</span>, so
        each needed the treasurer and the secretary rather than the full
        committee. Together they are above it. This is shown so the committee
        can look at the total, and it appears in the AGM report. It does not
        mean anything is wrong — work is often billed in parts.
      </p>
    </div>
  )
}
