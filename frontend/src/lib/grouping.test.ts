/**
 * THE SCREEN AND THE REPORT MUST GROUP DIGITS THE SAME WAY.
 *
 * `cf.money_text` on the server groups INR in the Indian style - the last
 * three digits, then twos - and every other currency in threes. `parts()`
 * grouped everything `en-IN`, so the same amount read `$1,23,456.00` on
 * screen and `USD 123,456.00` in the server-generated AGM report.
 *
 * Nothing is miscounted by this: the minor units are identical and no
 * arithmetic happens on the frontend at all. What breaks is the one thing
 * this product sells - that what a resident is shown IS the record. A
 * resident holding the printed report beside the screen sees two spellings
 * of one number and cannot tell a formatting difference from a discrepancy,
 * and the honest answer ("those are the same figure") is one they have to
 * take on trust, which is the thing the ledger exists to avoid.
 *
 * WHY THIS IS TESTED NOW, with no society using a foreign currency. `0002`
 * carries `currency` from the first schema so that adding one later touches
 * no hash-chained row. A formatter that assumes INR would make that
 * preparation worthless on the day it is used, and the failure would be
 * cosmetic enough to ship and confusing enough to matter.
 *
 * THE ORACLE IS THE SERVER'S RULE, written out, never a copied literal. An
 * assertion on `'$123,456.00'` gets "fixed" by editing the string when the
 * rule changes; an assertion against the rule has to be argued with.
 */
import { describe, expect, it } from 'vitest'
import { format, parts } from './money'

/*
 * The server's grouping, transcribed from `cf.money_text` - INR takes three
 * then twos, everything else takes threes. Deliberately a separate
 * implementation from the one under test: two derivations of one rule that
 * must agree, which is the only way this catches a wrong locale rather than
 * re-asserting whatever `Intl` happens to do.
 */
function serverGroup(whole: string, currency: string): string {
  if (currency === 'INR') {
    if (whole.length <= 3) return whole
    let head = whole.slice(0, -3)
    let g = ',' + whole.slice(-3)
    while (head.length > 2) {
      g = ',' + head.slice(-2) + g
      head = head.slice(0, -2)
    }
    return head + g
  }
  let head = whole
  let g = ''
  while (head.length > 3) {
    g = ',' + head.slice(-3) + g
    head = head.slice(0, -3)
  }
  return head + g
}

describe('digit grouping follows the currency, not the viewer', () => {
  it('THE DEFECT: a non-INR currency is grouped in threes, not in lakhs', () => {
    /*
     * 123456 dollars. The broken version produced `1,23,456`, which is not a
     * spelling of this number anyone outside India would recognise - and not
     * the one the server prints into the report either.
     */
    expect(parts(12345600, 'USD').whole).toBe('123,456')
  })

  it('keeps the Indian grouping for INR, which is the whole reason en-IN was there', () => {
    expect(parts(12507500, 'INR').whole).toBe('1,25,075')
    // One crore rupees: 10,000,000 whole, so 1,00,00,000 - not the same digit
    // count as the minor figure, which is why this is written out.
    expect(parts(1000000000, 'INR').whole).toBe('1,00,00,000')
  })

  it('matches the server rule across magnitudes and currencies', () => {
    /*
     * Exponents differ - JPY 0, USD/EUR 2, KWD 3 - so the minor figure is
     * built from the intended whole rather than reused, or the test would be
     * asserting about the exponent instead of about grouping.
     */
    const cases: Array<[string, number]> = [['INR', 2], ['USD', 2], ['EUR', 2], ['JPY', 0], ['KWD', 3]]
    const wholes = [0, 7, 99, 100, 999, 1000, 12345, 123456, 1234567, 12345678, 123456789]
    for (const [currency, e] of cases) {
      for (const w of wholes) {
        const minor = w * 10 ** e
        if (!Number.isSafeInteger(minor)) continue
        expect(parts(minor, currency).whole, `${currency} ${w}`)
          .toBe(serverGroup(String(w), currency))
      }
    }
  })

  it('groups the same whichever sign the amount carries', () => {
    expect(parts(-12345600, 'USD').whole).toBe(parts(12345600, 'USD').whole)
    expect(parts(-12507500, 'INR').whole).toBe(parts(12507500, 'INR').whole)
  })

  it('reaches format(), not only parts()', () => {
    /*
     * `format` is what the screens call. A fix landing in `parts` alone would
     * leave every rendered figure wrong while this file went green, which is
     * the "test the function that decides" trap one level down.
     */
    expect(format(12345600, 'USD')).toContain('123,456')
    expect(format(12345600, 'USD')).not.toContain('1,23,456')
    expect(format(12507500, 'INR')).toContain('1,25,075')
  })

  it('does not group below the threshold in either style', () => {
    for (const c of ['INR', 'USD']) {
      expect(parts(99900, c).whole, `${c} 999`).toBe('999')
    }
  })
})
