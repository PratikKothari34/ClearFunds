import { formatMoney, type Money } from '../lib/money'

export interface AmountProps {
  amount: Money | null | undefined
  /*
   * `strong` is the figure a resident is reading for - a row's own amount or
   * a balance. `quiet` is a supporting figure inside a breakdown.
   */
  weight?: 'strong' | 'quiet'
  /*
   * Struck through, for the original half of a reversed pair. The strike is
   * NEVER the only signal - the row also carries the word "cancelled".
   */
  cancelled?: boolean
  className?: string
}

/*
 * A money figure, and the three rules that govern every one in the product.
 *
 * 1. NO COLOUR-ONLY SIGNAL. A credit and an expense are told apart by the
 *    sign that is already in the formatted string, not by green against red.
 *    Roughly one man in twelve cannot separate those two hues, and this is a
 *    figure someone acts on. Colour is used to make a sign easier to find
 *    once you know what you are looking at, never to carry the meaning.
 *
 * 2. NO ARITHMETIC. The sign arrives from the server inside `minor`. This
 *    component does not negate, total, or compare - a silent wrong total is
 *    worse than a crash, because nobody sees it.
 *
 * 3. AN UNREADABLE FIGURE SAYS SO. `formatMoney` returns null rather than
 *    guessing, and this renders that as a visible sentence. A dash or a
 *    "0.00" would be a claim - "this flat owes nothing" - made on data that
 *    could not be read.
 */
export function Amount({
  amount,
  weight = 'strong',
  cancelled = false,
  className = '',
}: AmountProps) {
  const text = amount ? formatMoney(amount) : null

  if (text === null) {
    return (
      <span
        className={`font-body-sm text-body-sm text-on-surface-variant italic ${className}`}
      >
        {/* Stated, never substituted with a dash or a zero. */}
        Figure could not be read
      </span>
    )
  }

  /*
   * The 16px floor applies to `strong`, which is a figure acted on. It is
   * NOT a performance setting and NOT a style preference: it is about
   * reading a maintenance figure on a phone at arm's length. A faster phone
   * and a faster network improve neither eyesight nor arm length.
   */
  const size =
    weight === 'strong'
      ? 'text-tabular-currency-md font-tabular-currency-md font-semibold'
      : 'text-label-code-sm font-label-code-sm'

  if (cancelled) {
    return (
      <span className={`cf-tabular ${size} ${className}`}>
        <s className="text-on-surface-variant decoration-2">{text}</s>
        {/*
         * The strike-through is decoration and carries no meaning to a
         * screen reader, so the word is supplied. Without it, a cancelled
         * figure is read out as a live one.
         */}
        <span className="cf-sr-only"> (cancelled)</span>
      </span>
    )
  }

  return <span className={`cf-tabular ${size} text-on-surface ${className}`}>{text}</span>
}
