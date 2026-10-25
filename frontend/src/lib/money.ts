/*
 * MONEY: FORMATTING ONLY. THIS FILE DOES NO ARITHMETIC.
 *
 * HARD CONSTRAINT: the frontend never computes money. Every total, balance,
 * subtotal and difference arrives already computed by the server from signed,
 * chained entries. There is no add, no subtract, no sum, no percentage and no
 * division here, and none may be added.
 *
 * The reason is that a wrong total is worse than a crash. A crash is
 * reported; a balance that is wrong by one paise is read, believed, and
 * carried into an AGM. ₹12.50 mis-scaled to ₹0.125 is a PLAUSIBLE AMOUNT -
 * nobody looking at it can tell it is wrong.
 *
 * NOTHING HERE HARDCODES ÷100. The number of decimal places comes from the
 * currency: JPY has 0, KWD has 3, INR has 2. `Intl.NumberFormat` knows this,
 * so the scaling is delegated to it rather than written out.
 */

/*
 * An amount is an integer count of the currency's MINOR UNITS plus an ISO
 * 4217 code. ₹1,250.75 is `{ minor: 125075, currency: 'INR' }`.
 *
 * Not "paise". The product is INR-only today and carries `currency` from the
 * first schema anyway, because backfilling that column later would mean
 * touching hash-chained rows.
 *
 * `minor` is `number`, not `bigint`: Number.MAX_SAFE_INTEGER is about
 * 9.007e15, i.e. ₹90,071 crore in paise. A society of 150 flats is nowhere
 * near that, and the server is the one doing arithmetic regardless.
 */
export interface Money {
  readonly minor: number
  readonly currency: string
}

/*
 * The one formatter. Instances are cached because constructing an
 * Intl.NumberFormat is genuinely expensive and the ledger formats one per
 * row per render.
 */
const cache = new Map<string, Intl.NumberFormat>()

function formatter(currency: string, locale: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`
  const hit = cache.get(key)
  if (hit) return hit

  const made = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    /*
     * The grouping an Indian reader expects: ₹24,18,450.50, not
     * ₹2,418,450.50. `en-IN` gives the lakh/crore grouping for free.
     */
    currencyDisplay: 'symbol',
  })
  cache.set(key, made)
  return made
}

/*
 * How many minor units make one major unit, ACCORDING TO THE CURRENCY.
 * Derived from Intl, never hardcoded.
 */
function minorPerMajor(currency: string, locale: string): number {
  const digits = formatter(currency, locale).resolvedOptions()
    .maximumFractionDigits
  /*
   * The lib types mark this optional. Refusing to guess is the point: an
   * undefined digit count must not become `10 ** undefined`, which is NaN
   * and would make every formatted amount unreadable rather than wrong.
   * Falling back to 2 would be a hardcoded division by 100 by the back door,
   * so the caller is told instead.
   */
  if (digits === undefined) return Number.NaN
  return 10 ** digits
}

/*
 * Formats an amount for display.
 *
 * Returns `null` for an amount it cannot read, rather than a zero or a dash.
 * A surface that gets `null` must say it could not read the figure. Returning
 * 0 would be a claim - "this flat owes nothing" - made on missing data.
 */
export function formatMoney(
  amount: Money,
  locale = 'en-IN',
): string | null {
  if (!Number.isFinite(amount.minor) || !Number.isInteger(amount.minor)) {
    /*
     * A non-integer minor count means the ×100 boundary on input was crossed
     * wrongly somewhere upstream. Refusing to render it is the point: the
     * alternative is displaying ₹0.125 as ₹0.13 and moving on.
     */
    return null
  }
  if (typeof amount.currency !== 'string' || amount.currency.length !== 3) {
    return null
  }

  try {
    const scale = minorPerMajor(amount.currency, locale)
    // The currency did not report a decimal count; say nothing rather than guess.
    if (!Number.isFinite(scale)) return null
    /*
     * This division is SCALING FOR DISPLAY, not arithmetic on a value. It
     * converts the stored integer into the decimal the formatter wants, using
     * the currency's own number of decimal places. No amounts are combined,
     * compared or derived here.
     */
    return formatter(amount.currency, locale).format(amount.minor / scale)
  } catch {
    // An unrecognised currency code. Say nothing rather than guess a symbol.
    return null
  }
}

/*
 * The currency's symbol on its own, for a column header or a unit label where
 * the figures below carry the digits. Falls back to the code - "INR" is an
 * honest label; a guessed "₹" on an unknown currency is not.
 */
export function currencySymbol(currency: string, locale = 'en-IN'): string {
  try {
    const parts = formatter(currency, locale).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}
