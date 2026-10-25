import { describe, expect, it } from 'vitest'
import { formatMoney, currencySymbol, type Money } from './money'

/*
 * ASSERT THE RULE, NEVER THE SAMPLE NUMBER.
 *
 * An assertion like `expect(f(x)).toBe('₹1,250.75')` gets "fixed" by editing
 * the expected string when it fails, which deletes the test's meaning while
 * leaving it green. Every test below states a property that must hold for any
 * input, and derives its expectation from the input.
 */

const inr = (minor: number): Money => ({ minor, currency: 'INR' })

/* Digits only, so a locale's grouping and symbol cannot affect the comparison. */
const asNumber = (s: string) => Number(s.replace(/[^\d.]/g, ''))

describe('the minor-unit scale comes from the currency, never a hardcoded 100', () => {
  it('places the decimal point where the currency says, across 0, 2 and 3 decimal currencies', () => {
    /*
     * The same integer, read as three different currencies. JPY has 0
     * decimal places, INR has 2, KWD has 3. A hardcoded division by 100 would
     * put the point in the same place all three times.
     */
    const cases = [
      { currency: 'JPY', digits: 0 },
      { currency: 'INR', digits: 2 },
      { currency: 'KWD', digits: 3 },
    ]

    for (const { currency, digits } of cases) {
      const out = formatMoney({ minor: 123456, currency })
      expect(out, `${currency} did not format at all`).not.toBeNull()

      /*
       * Count the digits after the DECIMAL POINT specifically. Matching any
       * separator is wrong here: Indian grouping puts a comma three digits
       * from the right, so `/[.,](\d+)$/` reads the lakh group ",456" of
       * "JP¥1,23,456" as three decimal places and reports a 0-decimal
       * currency as having 3.
       */
      const fraction = /\.(\d+)$/.exec(out!)
      const actualDigits = fraction ? fraction[1]!.length : 0
      expect(
        actualDigits,
        `${currency} must render ${digits} decimal places, got "${out}". ` +
          'A hardcoded division by 100 makes every currency render 2.',
      ).toBe(digits)
    }
  })

  it('scales by the currency, so the same integer is a different value in each', () => {
    /*
     * minor:100 is 100 yen but 1 rupee - the integer is not the value.
     *
     * Compared as the NUMBER the output denotes, not as its digit string:
     * stripping separators turns "JP¥100" and "₹1.00" into "100" and "100",
     * so the two different values look identical and the assertion passes
     * on a hardcoded division by 100.
     */
    const jpy = asNumber(formatMoney({ minor: 100, currency: 'JPY' })!)
    const ind = asNumber(formatMoney({ minor: 100, currency: 'INR' })!)
    expect(
      jpy,
      'a 0-decimal currency must not be divided, so 100 minor units is 100 ' +
        'whole yen while 100 paise is 1 rupee',
    ).toBeGreaterThan(ind)
  })

  it('renders one minor unit as a non-zero amount in every currency', () => {
    for (const currency of ['INR', 'JPY', 'KWD']) {
      const out = formatMoney({ minor: 1, currency })
      expect(out, `${currency} failed on its smallest unit`).not.toBeNull()
      expect(out!).toMatch(/[1-9]/)
    }
  })
})

describe('an unreadable amount returns null, never a zero', () => {
  /*
   * This is the whole contract. Returning 0 or a dash would be a CLAIM made
   * on missing data - that the flat owes nothing. Returning null forces the
   * surface to disclose that it could not read the figure.
   */
  const bad: { what: string; amount: Money }[] = [
    { what: 'NaN', amount: inr(Number.NaN) },
    { what: 'Infinity', amount: inr(Number.POSITIVE_INFINITY) },
    { what: 'negative Infinity', amount: inr(Number.NEGATIVE_INFINITY) },
    { what: 'a fractional minor unit', amount: inr(12.5) },
    { what: 'an empty currency', amount: { minor: 1, currency: '' } },
    { what: 'a two-letter currency', amount: { minor: 1, currency: 'IN' } },
  ]

  for (const { what, amount } of bad) {
    it(`returns null for ${what}`, () => {
      expect(formatMoney(amount)).toBeNull()
    })
  }

  it('never substitutes a renderable figure for any bad input', () => {
    for (const { what, amount } of bad) {
      const out = formatMoney(amount)
      expect(out, `${what} produced "${out}" instead of null`).toBeNull()
    }
  })
})

describe('a readable amount always formats', () => {
  it('formats zero, positive and negative integers', () => {
    for (const m of [0, 1, -1, 999999999]) {
      expect(formatMoney(inr(m)), `minor ${m} failed`).not.toBeNull()
    }
  })

  it('keeps a negative amount distinguishable from its positive counterpart', () => {
    // The rule, not the glyph: however the locale marks it, the two differ.
    const pos = formatMoney(inr(50000))!
    const neg = formatMoney(inr(-50000))!
    expect(neg).not.toBe(pos)
  })

  it('groups an Indian amount the way an Indian reader expects', () => {
    /*
     * The lakh grouping rule: the three rightmost integer digits group
     * together, then digits group in pairs. A 9-digit minor amount therefore
     * has more than two groups, with the rightmost being exactly three.
     * Asserted as a shape so no sample number carries the meaning.
     */
    const out = formatMoney(inr(241845050))!
    const integerPart = out.replace(/^\D*/, '').split(/\.(?=\d+$)/)[0]!
    const groups = integerPart.split(',')
    expect(
      groups[groups.length - 1],
      `expected the rightmost group to be 3 digits in "${out}"`,
    ).toHaveLength(3)
    expect(
      groups.length,
      `expected lakh-style grouping, so more than 2 groups, in "${out}"`,
    ).toBeGreaterThan(2)
  })
})

describe('the currency symbol', () => {
  it('returns the code itself rather than guessing a symbol it does not know', () => {
    // A guessed glyph on an unknown currency misinforms; the code is honest.
    expect(currencySymbol('ZZZ')).toBe('ZZZ')
  })

  it('returns a symbol distinct from the code for a currency it does know', () => {
    expect(currencySymbol('INR')).not.toBe('INR')
  })
})
