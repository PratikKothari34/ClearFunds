/*
 * WHAT THE YEAR'S SPEND CARD IS ALLOWED TO CALL A TOTAL.
 *
 * The card showed the top four categories and then a line reading
 * "Total <the whole year's spend>". The server sends every category and a
 * separate total over all of them, so both figures were right and the screen
 * was false about the society: four rows summing to Rs 11,39,222.88 above a
 * "Total" of Rs 12,46,422.88. Measured on the seeded society - seven
 * categories, three hidden, and the Rs 1,07,200 difference is exactly those
 * three.
 *
 * This is the shape CLAUDE.md calls a count contradicting its own evidence: a
 * figure sitting directly below rows the reader has already added up. A
 * resident checking the arithmetic finds it wrong and has no way to tell that
 * the list was truncated, because nothing on the card says so. Nothing throws,
 * no test fails, and the reader who does the most work to verify the figure is
 * the one most misled - which is the opposite of what this product is for.
 *
 * So the decision is made here rather than in the route:
 *
 *   - the total is labelled for what it actually covers, and the card says so
 *     when rows are hidden rather than leaving the reader to subtract;
 *   - a shown subtotal is only ever called a subtotal;
 *   - the bar scale is computed from what could make a bar, never from
 *     whichever row happens to sort first.
 *
 * A rule left in the route could not be tested without mounting a router, so
 * it would not get tested - which is how the sign-off oldest-month bug
 * survived.
 *
 * NEGATIVE CATEGORIES ARE REAL. A category whose expenses are more than
 * reversed nets below zero: `admin` is -Rs 4,200 on the seeded society today.
 * The old scale was `top[0].amount_minor || 1`, which takes the first row's
 * value on trust - `|| 1` catches exactly zero and not a negative - so a
 * negative leader scaled every bar by a negative number and inverted the lot.
 * A bar cannot show a negative length, so a negative category gets no bar and
 * keeps its figure, which is the honest rendering: the number is the record and
 * the bar is only a reading aid.
 */

export type SpendItem = { category: string; amount_minor: number }

export type SpendView = {
  /** The rows to draw, in the order given. */
  shown: SpendItem[]
  /** How many categories were left out. Zero when everything is shown. */
  hidden: number
  /** The sum of `shown`, for the subtotal line. Null when nothing is shown. */
  shownTotal: number | null
  /** The server's figure over EVERY category, whatever is shown. */
  allTotal: number
  /**
   * What the bottom line may truthfully claim. `all` when the rows account for
   * the whole figure; `partial` when categories are hidden, and the caller must
   * then disclose the count rather than print a bare "Total".
   */
  covers: 'all' | 'partial'
  /**
   * The denominator for bar widths: the largest POSITIVE shown amount, or null
   * when no shown category is positive and no bar can be drawn at all.
   */
  scale: number | null
}

/**
 * Decide what the spend card shows and what its bottom line may be called.
 *
 * `limit` is the number of rows the card has room for. It is a parameter and
 * not a constant in here because it is a layout fact, but the CONSEQUENCE of
 * truncating - that the total must then be disclosed as covering more than the
 * rows - is decided here, where it is tested.
 */
export function spendView(items: readonly SpendItem[], allTotal: number, limit: number): SpendView {
  if (!Number.isSafeInteger(allTotal)) throw new RangeError('spend total is not a safe integer')
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('spend row limit must be a positive integer')
  for (const i of items) {
    if (!Number.isSafeInteger(i.amount_minor)) {
      throw new RangeError(`spend amount for ${i.category} is not a safe integer`)
    }
  }

  const shown = items.slice(0, limit)
  const hidden = Math.max(0, items.length - shown.length)
  const shownTotal = shown.length ? shown.reduce((a, c) => a + c.amount_minor, 0) : null

  /*
   * `covers` asks ONE question: do the printed rows add up to the printed
   * figure? Not `hidden === 0`, which was the first thing written here and is
   * wrong - it reports "all" whenever nothing was truncated, including when the
   * server's total covers something the category list does not, which is a
   * disagreement with every row on screen and the reader's subtraction still
   * failing. Caught by its own test rather than in review.
   *
   * `?? 0` here is the coercion CLAUDE.md warns about - absent treated as zero
   * - and it is deliberate in this one place: `shownTotal` is null only when
   * there are no rows at all, and no rows genuinely do sum to nothing, so the
   * equality against a zero total is true rather than assumed. It decides a
   * LABEL, never an amount; no figure is computed from it.
   */
  const covers = (shownTotal ?? 0) === allTotal ? 'all' : 'partial'

  const positives = shown.map((c) => c.amount_minor).filter((n) => n > 0)
  const scale = positives.length ? Math.max(...positives) : null

  return { shown, hidden, shownTotal, allTotal, covers, scale }
}

/**
 * The width a category's bar may claim, as a percentage, or null for no bar.
 *
 * Never negative and never over 100: a negative category gets no bar, and
 * nothing is scaled against a denominator that is not a positive amount.
 *
 * Both arguments are readable amounts by the time they arrive - `spendView`
 * threw on anything that was not a safe integer, and `scale` it derived
 * itself. The ordered comparisons below are therefore already narrowed, which
 * is what `minor.sweep.test.ts` requires: `null <= 0` is TRUE, so this would
 * silently hand an unreadable figure the same "no bar" answer it gives a
 * genuine negative, while the figure beside it threw. `countable()` is the
 * gate for a value straight off the wire; here the gate is `spendView`, and
 * the parameter is deliberately a bare `number` so a caller cannot route a
 * nullable figure past it without the compiler objecting.
 */
export function barPercent(amount_minor: number, scale: number | null): number | null {
  if (scale === null || scale <= 0) return null
  if (!Number.isSafeInteger(amount_minor)) {
    throw new RangeError('bar amount is not a safe integer; it has not been through spendView')
  }
  if (amount_minor <= 0) return null
  return Math.min(100, (amount_minor / scale) * 100)
}
