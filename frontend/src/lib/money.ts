// Money is an integer count of the currency's minor units (AGENTS.md
// item 4). Nothing here divides: formatting splits the digit string, and
// parsing builds the integer from digits. No float touches an amount.

const exponents = new Map<string, number>()

/** Decimal places of a currency, from Intl: INR 2, JPY 0, KWD 3. */
export function exponent(currency: string): number {
  let e = exponents.get(currency)
  if (e === undefined) {
    e = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
    exponents.set(currency, e)
  }
  return e
}

const grouping = new Intl.NumberFormat('en-IN', { useGrouping: true })

function symbol(currency: string): string {
  return (
    new Intl.NumberFormat('en-IN', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? currency
  )
}

export type Parts = { sign: '' | '-' | '+'; symbol: string; whole: string; fraction: string }

export function parts(minor: number, currency: string, opts: { signed?: boolean } = {}): Parts {
  if (!Number.isSafeInteger(minor)) throw new RangeError('amount is not a safe integer')
  const e = exponent(currency)
  const digits = Math.abs(minor).toString().padStart(e + 1, '0')
  const whole = digits.slice(0, digits.length - e) || '0'
  return {
    sign: minor < 0 ? '-' : opts.signed && minor > 0 ? '+' : '',
    symbol: symbol(currency),
    whole: grouping.format(BigInt(whole)),
    fraction: e ? digits.slice(digits.length - e) : '',
  }
}

/** ₹1,25,075.00 style, Indian digit grouping. */
export function format(minor: number, currency = 'INR', opts: { signed?: boolean; compact?: boolean } = {}): string {
  const p = parts(minor, currency, opts)
  const frac = p.fraction && !(opts.compact && /^0+$/.test(p.fraction)) ? `.${p.fraction}` : ''
  return `${p.sign === '-' ? '−' : p.sign}${p.symbol}${p.whole}${frac}`
}

/**
 * Parses what a person types ("12,500", "1250.5") into minor units.
 * Returns null for anything that is not a plain non-negative amount with no
 * more decimal places than the currency has.
 */
export function parse(input: string, currency = 'INR'): number | null {
  const e = exponent(currency)
  const s = input.replace(/[\s,₹]/g, '')
  const m = new RegExp(`^(\\d+)(?:\\.(\\d{0,${e}}))?$`).exec(s)
  if (!m) return null
  const whole = BigInt(m[1]!)
  const frac = BigInt((m[2] ?? '').padEnd(e, '0') || '0')
  const minor = whole * 10n ** BigInt(e) + frac
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return Number(minor)
}

/** Minor units back into what a person would type: "3250.01", no grouping. */
export function toInput(minor: number, currency = 'INR'): string {
  const p = parts(Math.abs(minor), currency)
  return p.whole.replace(/[^\d]/g, '') + (p.fraction ? `.${p.fraction}` : '')
}
