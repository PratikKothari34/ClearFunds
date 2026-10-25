import { formatMoney, minorUnitDigits } from '../lib/money'
import type { AllocationRemainder } from '../lib/types'

/**
 * How an indivisible remainder was shared out.
 *
 * THE DISCREPANCY THIS EXPLAINS IS REAL AND WILL BE FOUND. A resident
 * who adds up the per-flat shares and compares the total to the
 * society's figure finds them differing by a few paise. That looks
 * exactly like the thing this product exists to detect, and the honest
 * answer — the money did not divide evenly — is invisible unless
 * something says it.
 *
 * NOTHING HERE DIVIDES ANYTHING. `remainderMinor` and `carriedBy` are
 * server-computed; this component formats them. The frontend does no
 * money arithmetic, and a remainder is arithmetic.
 *
 * The unit is named from the currency, never hardcoded. "Paise" would
 * be wrong for JPY, which has no minor unit at all, and the product
 * carries `currency` from the first schema precisely so this kind of
 * copy does not have to be rewritten later.
 */
export function AllocationNote({
  remainder,
}: {
  readonly remainder: AllocationRemainder
}) {
  /*
   * A currency with no minor unit cannot leave a remainder, so there is
   * nothing to disclose. Rendering "0 minor units" would invent a
   * concern rather than explain one.
   */
  if (remainder.remainderMinor <= 0) return null

  const digits = minorUnitDigits(remainder.total.currency)
  const unitName = digits === 0 ? 'unit' : 'smallest unit'
  const n = remainder.remainderMinor

  return (
    <div>
      <p className="m-0">
        <span className="cf-tabular">{formatMoney(remainder.total)}</span> did
        not divide evenly between{' '}
        <span className="cf-tabular">{remainder.flatCount}</span> flats.
      </p>
      <p className="mt-space-sm mb-0 font-label-code-sm text-label-code-sm text-on-surface-variant max-w-[68ch]">
        <span className="cf-tabular">{n}</span> {unitName}
        {n === 1 ? '' : 's'} were left over. They went to the{' '}
        {remainder.carriedBy.length === 1 ? 'flat' : 'flats'} that had taken
        the smallest share so far, so the extra rotates and no flat carries it
        every time:{' '}
        <span className="cf-tabular">{remainder.carriedBy.join(', ')}</span>.
      </p>
    </div>
  )
}
