/**
 * Money display and input.
 *
 * An amount is an integer count of the currency's minor units next to an
 * ISO 4217 code. Rs 1,250.75 is `{ minor: 125075, currency: 'INR' }`.
 *
 * Two rules this module exists to enforce:
 *
 * 1. No floating point, at any layer. `minor` is a JS number but is only
 *    ever an integer; nothing here divides it. Formatting is handed to
 *    Intl, which takes minor units directly.
 * 2. Nothing hardcodes a division by 100. The number of decimal places
 *    comes from the currency: INR has 2, JPY has 0, KWD has 3. A
 *    hardcoded 100 silently misreports two of those.
 *
 * The frontend does no money arithmetic. It displays what the server
 * computed. There is no add, no subtract and no running-total function in
 * this file on purpose — a balance shown to a resident must be the one the
 * server derived from the chain, not one re-derived here from rows that
 * might be a page short.
 */

export interface Money {
  /** Integer count of minor units. Never fractional. */
  readonly minor: number
  /** ISO 4217, e.g. 'INR'. Carried from the first schema. */
  readonly currency: string
}

/*
 * Formatters are memoized per (locale, currency, display).
 *
 * `new Intl.NumberFormat` is one of the more expensive constructors in
 * the platform — it resolves locale data every time. The ledger is
 * virtualized, so a scroll re-renders every visible row, and an
 * un-memoized formatter would be constructed once per amount per frame.
 * The design states this directly: "Amounts formatted once, memoized
 * per currency. Constructing a formatter per cell is measurable in a
 * long table."
 *
 * The cache is unbounded by design and that is safe here: the key space
 * is (handful of locales) x (currencies in use, in practice one) x 2,
 * not user input.
 */
const formatters = new Map<string, Intl.NumberFormat>()

function formatter(
  locale: string,
  currency: string,
  showSymbol: boolean,
  digits: number,
): Intl.NumberFormat {
  const key = `${locale}|${currency}|${showSymbol}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: showSymbol ? 'symbol' : 'code',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
    formatters.set(key, f)
  }
  return f
}

const digitsCache = new Map<string, number>()

/**
 * Minor-unit exponent for a currency, from Intl rather than a table.
 *
 * Memoized for the same reason as the formatters: this builds a
 * NumberFormat of its own, so an un-cached call doubles the cost of
 * every formatMoney.
 */
export function minorUnitDigits(currency: string): number {
  const hit = digitsCache.get(currency)
  if (hit !== undefined) return hit

  const parts = new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).resolvedOptions()
  const digits = parts.maximumFractionDigits ?? 2
  digitsCache.set(currency, digits)
  return digits
}

/**
 * Formats for display. `en-IN` gives the lakh/crore grouping a resident
 * expects: 1,20,00,000 rather than 12,000,000.
 */
export function formatMoney(
  m: Money,
  opts: { locale?: string; showSymbol?: boolean } = {},
): string {
  const { locale = 'en-IN', showSymbol = true } = opts
  const digits = minorUnitDigits(m.currency)
  // The one division in the module, and it is display-only: the quotient
  // is handed straight to Intl with the fraction digits pinned, so a
  // binary-floating-point tail is rounded away by the formatter and never
  // reaches a stored value or another calculation. The integer in `minor`
  // remains the only authority. 10**digits comes from the currency, so
  // JPY (0) and KWD (3) format correctly too.
  return formatter(locale, m.currency, showSymbol, digits).format(
    m.minor / 10 ** digits,
  )
}

/**
 * Parses a typed major-unit string into minor units.
 *
 * This is the boundary the project calls out as the place bugs will live:
 * a missing multiply stores Rs 12.50 as Rs 0.125, which is a plausible
 * amount that will not look wrong in a list. So this function does the
 * scaling by string manipulation rather than by multiplying a float —
 * `12.50 * 100` is 1250.0000000000002 in binary floating point, and
 * Math.round would hide that today and not in some other case.
 *
 * Returns null for anything it cannot parse exactly. A caller must treat
 * null as "do not submit", never as zero.
 */
export function parseMoney(input: string, currency: string): Money | null {
  const digits = minorUnitDigits(currency)
  const trimmed = input.trim().replace(/[\s, ]/g, '')
  if (trimmed === '') return null

  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(trimmed)
  if (!m) return null

  const [, sign, whole = '', frac = ''] = m
  if (whole === '' && frac === '') return null
  // More typed decimals than the currency has is a mistake, not a rounding
  // opportunity: refuse rather than silently drop a digit the person typed.
  if (frac.length > digits) return null

  const scaled = whole + frac.padEnd(digits, '0')
  // Strip leading zeros so '007' does not become an octal-looking string.
  const value = Number(scaled === '' ? '0' : scaled)
  if (!Number.isSafeInteger(value)) return null

  return { minor: sign === '-' ? -value : value, currency }
}

/** Splits a formatted amount so a row can align on the decimal separator. */
export function formatParts(
  m: Money,
  locale = 'en-IN',
): { integer: string; fraction: string; symbol: string } {
  const digits = minorUnitDigits(m.currency)
  const parts = formatter(locale, m.currency, true, digits).formatToParts(
    m.minor / 10 ** digits,
  )

  let integer = ''
  let fraction = ''
  let symbol = ''
  let seenDecimal = false
  for (const p of parts) {
    if (p.type === 'currency') symbol += p.value
    else if (p.type === 'decimal') seenDecimal = true
    else if (p.type === 'fraction') fraction += p.value
    else if (p.type === 'integer' || p.type === 'group' || p.type === 'minusSign') {
      if (!seenDecimal) integer += p.value
    }
  }
  return { integer, fraction, symbol }
}
