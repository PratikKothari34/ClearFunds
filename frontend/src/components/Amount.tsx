import { formatMoney } from '../lib/money'
import type { Money } from '../lib/types'

/**
 * A money figure.
 *
 * Three things every amount in the product needs, in one place:
 *
 *   - `tabular-nums`, without exception. Proportional figures make a
 *     column of rupee amounts fail to align, which makes a correct
 *     ledger look wrong.
 *   - `whitespace-nowrap`. An amount broken across two lines is
 *     unreadable and, worse, briefly looks like a different number.
 *   - A direction that is never signalled by colour alone. `in` and
 *     `out` carry a sign and an announced word, so the information
 *     survives a colour-blind reader, a monochrome print and a
 *     screenshot.
 */

export function Amount({
  value,
  direction,
  className = '',
}: {
  readonly value: Money
  /** Omitted for a balance, which has no direction. */
  readonly direction?: 'in' | 'out'
  readonly className?: string
}) {
  const text = formatMoney(value)

  const tone =
    direction === 'in'
      ? 'text-secondary'
      : direction === 'out'
        ? 'text-error'
        : ''

  return (
    <span className={`cf-tabular whitespace-nowrap ${tone} ${className}`}>
      {direction && (
        <>
          {/*
           * The sign is the non-colour signal. It is aria-hidden and
           * replaced by a word, because "minus" read before an amount
           * is ambiguous about whether the society paid or was paid.
           */}
          <span aria-hidden="true">{direction === 'in' ? '+' : '-'}</span>
          <span className="cf-sr-only">
            {direction === 'in' ? 'received ' : 'paid '}
          </span>
        </>
      )}
      {text}
    </span>
  )
}
