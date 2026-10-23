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
): Intl.NumberFormat | null {
  const key = `${locale}|${currency}|${showSymbol}`
  let f = formatters.get(key)
  if (!f) {
    // `Intl.NumberFormat` THROWS a RangeError on a currency code it does
    // not recognise, including '' and 'rupees'. `currency` arrives from
    // the server, so an unvalidated construction here takes down the
    // whole route — the ledger, the balance, every amount on screen —
    // over one malformed field. Returning null lets the caller degrade to
    // showing the digits it is sure about.
    try {
      f = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: showSymbol ? 'symbol' : 'code',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    } catch {
      return null
    }
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

  let digits = 2
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
    }).resolvedOptions()
    digits = parts.maximumFractionDigits ?? 2
  } catch {
    // Same RangeError as above. 2 is the fallback only so the caller can
    // keep going; a currency Intl rejects will not format at all.
    digits = 2
  }
  digitsCache.set(currency, digits)
  return digits
}

/**
 * The exact decimal string for an amount, e.g. 125075 INR -> '1250.75'.
 *
 * This replaces `minor / 10 ** digits`, which is a FLOAT division and is
 * wrong near the top of the safe-integer range:
 * `9007199254740991 / 100` formats as ...409.90 where the true value
 * ends ...409.91. The old comment claimed pinning the fraction digits
 * made the division safe because Intl would round the binary tail away.
 * It does round, but it rounds a quotient that has already lost the
 * digit — the error is in the division, not the display.
 *
 * Intl accepts a string and parses it as an exact decimal, so handing it
 * the digits directly never constructs the lossy intermediate. Verified
 * against MAX_SAFE_INTEGER in money.test.ts.
 */
function exactDecimal(minor: number, digits: number): string {
  const negative = minor < 0
  // Math.abs before the string work: the sign is re-attached at the end
  // so it cannot be swallowed by padStart.
  const raw = String(Math.abs(minor))
  const padded = raw.padStart(digits + 1, '0')
  const cut = padded.length - digits
  const whole = padded.slice(0, cut)
  const frac = padded.slice(cut)
  const body = digits === 0 ? whole : `${whole}.${frac}`
  return negative ? `-${body}` : body
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
  const f = formatter(locale, m.currency, showSymbol, digits)
  // No division: the exact decimal string goes to Intl. See exactDecimal.
  const decimal = exactDecimal(normalizeZero(m.minor), digits)
  if (!f) {
    // Unformattable currency. Show the digits and the raw code rather
    // than a blank or a crash — a resident seeing "1250.75 XYZ" can still
    // read the amount and tell someone the code looks wrong.
    return `${decimal} ${m.currency}`
  }
  return f.format(exact(decimal))
}

/**
 * Lets an exact decimal string reach `Intl`.
 *
 * `Intl.NumberFormat.format` accepts a string at RUNTIME and parses it
 * losslessly — which is the entire reason exactDecimal exists, since
 * dividing by 10**digits loses a digit near the top of the safe-integer
 * range. The TYPES only admit `StringNumericLiteral`, a
 * template-literal type that cannot describe a string assembled at
 * runtime, so there is no way to satisfy it without going back to the
 * float division this replaced.
 *
 * The cast is therefore narrowing the types to what the runtime
 * actually does, not working around a real error. It is confined to
 * this one helper so no other call site can cast something that is not
 * a decimal string: exactDecimal is the only producer, and
 * money.test.ts asserts the digits survive across the whole accepted
 * range.
 */
function exact(decimal: string): number {
  return decimal as unknown as number
}

/**
 * Collapses -0 to 0.
 *
 * `Intl` formats negative zero as "-Rs 0.00". A minus sign in front of a
 * zero amount reads as a debit that is not there, and on a balance it
 * reads as the society being very slightly overdrawn. Nothing upstream
 * means -0 as distinct from 0.
 */
function normalizeZero(minor: number): number {
  return minor === 0 ? 0 : minor
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
  /*
   * Whitespace is stripped; a COMMA IS NOT, and that distinction is the
   * whole point of this block.
   *
   * Stripping commas treated '12,50' as '1250' and stored Rs 1,250.00
   * where the person meant Rs 12.50 - a silent 100x overstatement, in
   * exactly the direction nobody checks, on an entry that looks entirely
   * plausible in a list. A comma means a thousands separator to one
   * person and a decimal point to another, and this function cannot tell
   * which from the string alone.
   *
   * So it refuses. Returning null puts the question back to the person
   * who knows the answer, and the caller must treat null as "do not
   * submit". Guessing here is how the project's named worst bug ships.
   *
   * \s does not cover U+00A0, which is what a paste out of a spreadsheet
   * or a PDF carries, so the class names it explicitly.
   */
  const trimmed = input.trim().replace(/[\s\u00a0]/g, '')
  if (trimmed === '') return null
  if (trimmed.includes(',')) return null

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

  /*
   * `value === 0 ? 0` keeps NEGATIVE ZERO out of the result.
   *
   * '-0' and '-0.00' are things a person types, usually mid-correction,
   * and `-0` would otherwise come straight back out. It is not a
   * display problem — formatMoney normalises it on the way to the
   * screen — it is that -0 reads as negative to every sign test
   * downstream while comparing equal to 0, so a guard like
   * `minor < 0 ? 'debit' : 'credit'` disagrees with
   * `Object.is(minor, -0)` and the two halves of the same decision
   * split. Nothing in the chain should carry a signed zero.
   */
  const signed = sign === '-' && value !== 0 ? -value : value
  return { minor: signed, currency }
}

/** Splits a formatted amount so a row can align on the decimal separator. */
export function formatParts(
  m: Money,
  locale = 'en-IN',
): { integer: string; fraction: string; symbol: string } {
  const digits = minorUnitDigits(m.currency)
  const f = formatter(locale, m.currency, true, digits)
  const decimal = exactDecimal(normalizeZero(m.minor), digits)
  if (!f) {
    // Same degradation as formatMoney, split the way a row expects so the
    // decimal alignment still holds.
    const dot = decimal.indexOf('.')
    return dot === -1
      ? { integer: decimal, fraction: '', symbol: m.currency }
      : {
          integer: decimal.slice(0, dot),
          fraction: decimal.slice(dot + 1),
          symbol: m.currency,
        }
  }
  const parts = f.formatToParts(exact(decimal))

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
