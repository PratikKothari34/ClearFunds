// Money is an integer count of the currency's minor units (AGENTS.md
// item 4). Nothing here divides: formatting splits the digit string, and
// parsing builds the integer from digits. No float touches an amount.

/*
 * Minor-unit digits per currency.
 *
 * **`Intl` is NOT ISO 4217 and the two disagree.** Measured on this runtime:
 * `Intl` reports IQD as 0 digits, while ISO 4217 says 3. An Iraqi dinar
 * amount of 1500 minor units is 1.500 IQD, and the Intl answer renders it
 * "1,500" - a thousandfold error, in the direction that looks like a larger
 * balance, with nothing failing anywhere. It is the missing-x100 bug wearing a
 * different hat: a plausible figure that is wrong, which is worse than a
 * crash.
 *
 * **`Intl` also never admits it does not know.** Measured: every well-formed
 * three-letter code resolves to 2 digits - `XXX`, `XTS`, `QQQ`, `ABC` all
 * report 2, and `maximumFractionDigits` is never `undefined`. Only a
 * malformed code throws. So an `?? 2` fallback behind it was dead code, and
 * the real silent default was `Intl` itself: an unknown currency became a
 * two-decimal currency with full confidence, which for a 0-digit or 3-digit
 * currency is every figure wrong by 100x or 10x.
 *
 * So `Intl` is not a source for this at all. Two sources, in order:
 *
 *   1. An exponent the SERVER stated, when one has been supplied. The server
 *      owns an ISO table and is authoritative - its rule is that an unknown
 *      currency is refused there, never guessed.
 *   2. This table, each row checked against ISO 4217.
 *
 * Anything else THROWS. There is no fallback, because every available
 * fallback is a confident wrong answer: the render boundary contains the
 * throw to one screen and the figure is disclosed as unreadable, which is
 * what the product owes a reader. A wrong exponent is not a display bug, it
 * is a wrong amount, and an amount nobody can verify is the one thing this
 * ledger must never show.
 *
 * `Intl` is still used for the SYMBOL, where a wrong answer is cosmetic and a
 * missing one falls back to the code itself.
 */
const ISO_4217: Readonly<Record<string, number>> = {
  // INR is the only currency ClearFunds ships with. The rest are here so a
  // society in another currency is formatted correctly rather than refused -
  // and so the 0-digit and 3-digit cases are covered, since those are the
  // ones a 2-digit default corrupts.
  INR: 2,
  // 3 digits. IQD is the case that proves the rule: Intl reports 0 for it.
  IQD: 3,
  BHD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  // 0 digits.
  JPY: 0,
  KRW: 0,
  VND: 0,
  ISK: 0,
  UGX: 0,
  CLP: 0,
  PYG: 0,
  RWF: 0,
  XAF: 0,
  XOF: 0,
  // 2 digits, the common case: the major currencies a society might hold.
  USD: 2,
  EUR: 2,
  GBP: 2,
  AED: 2,
  SAR: 2,
  SGD: 2,
  AUD: 2,
  CAD: 2,
  CHF: 2,
  LKR: 2,
  NPR: 2,
  BDT: 2,
  PKR: 2,
}

const exponents = new Map<string, number>()

/**
 * Record an exponent the server stated for a currency.
 *
 * Called once with what `api_me` reports, so formatting uses the server's ISO
 * table rather than a second derivation of the same number. Two derivations of
 * one exponent agree on the common cases and diverge exactly where nobody is
 * looking, which is why this exists at all.
 */
export function setExponent(currency: string, digits: number): void {
  if (!Number.isInteger(digits) || digits < 0 || digits > 4) {
    throw new RangeError(`exponent for ${currency} is not 0-4`)
  }
  exponents.set(currency, digits)
}

/**
 * Adopt the exponent `api_me` stated for this society's currency.
 *
 * This is the DECISION, not the reporting of it, so it lives here rather than
 * inside the query hook: a rule left in a hook cannot be tested without
 * mounting a router, so it does not get tested.
 *
 * Two things it deliberately does NOT do:
 *
 *   - It does not fall back when the server sent no exponent. A deployment
 *     older than the migration that added the field simply leaves the table
 *     in charge, and the table throws on a currency it does not know. Writing
 *     a default here would be the one outcome that is never acceptable.
 *   - It does not reconcile a disagreement, because a disagreement cannot
 *     happen in a direction we could resolve: the server owns an ISO table
 *     and refuses an unknown currency, so its figure wins outright. `exponent`
 *     already encodes that precedence.
 *
 * Returns whether an exponent was adopted, so a caller can tell "the server
 * stated it" from "we are formatting off the local table" without reading the
 * cache. Nothing branches on it today; it exists so that a surface disclosing
 * a degraded read has the fact available rather than having to infer it.
 */
export function adoptExponent(society: { currency: string; currency_exponent: number | null }): boolean {
  if (society.currency_exponent === null) return false
  setExponent(society.currency, society.currency_exponent)
  return true
}

/**
 * Decimal places of a currency: the server's figure, else this ISO table,
 * else a throw.
 *
 * Never `Intl`, and never a default. See the note above: `Intl` answers 2 for
 * any well-formed code it has never heard of, so consulting it here would
 * reintroduce exactly the silent wrong answer this guards against.
 */
export function exponent(currency: string): number {
  const known = exponents.get(currency) ?? ISO_4217[currency]
  if (known === undefined) {
    throw new RangeError(
      `no ISO 4217 minor-unit exponent for ${currency}; the server must state it`,
    )
  }
  return known
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
