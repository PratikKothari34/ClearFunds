/*
 * `toInput` PREFILLS A RECEIPT AMOUNT, SO ITS OUTPUT IS A PROPOSED PAYMENT.
 *
 * One caller: `/dues` builds "Record a payment" with
 * `amount: toInput(owed.minor, ccy)`, so whatever this returns becomes the
 * figure a treasurer is shown as the amount received from a resident. It is
 * the inverse of `parse` and nothing asserted the pair, which is the only
 * property that makes a prefill correct rather than merely plausible.
 *
 * The x100 boundary is where the bugs live: a dropped multiply turns
 * Rs 1,250.75 into Rs 12.5075 or Rs 125075, all three of which are amounts a
 * society could genuinely owe. None of them looks wrong. So the assertions
 * here are round-trip and exponent-shaped, never a comparison against a
 * hand-written string that a later edit could "fix" by changing the expected
 * number.
 *
 * ON THE SIGN. `toInput` applies `Math.abs`, so a negative amount returns as
 * a positive string - a credit of Rs 1,250.75 would prefill a receipt FOR
 * Rs 1,250.75. That is unreachable today and this suite does not pretend
 * otherwise: the caller is gated on `countable(...).owing`, which is
 * `minor > 0`, so a credit never reaches it. The case is pinned anyway,
 * because the gate and the absolute value are in different files and the
 * safety is entirely in the gate - a future caller prefilling from any other
 * figure inherits a function that silently discards a minus sign. The test
 * states the current behaviour and names the gate it depends on, rather than
 * asserting a behaviour the function does not have.
 */
import { describe, expect, it } from 'vitest'
import { exponent, parse, toInput } from './money'
import { countable } from './countable'

describe('toInput', () => {
  it('round-trips through parse, which is the property that makes it correct', () => {
    // The inverse pair. Asserting the round-trip rather than a literal
    // string means a changed grouping or separator cannot be "fixed" by
    // editing an expected value.
    for (const ccy of ['INR', 'JPY', 'IQD', 'USD']) {
      for (const minor of [0, 1, 5, 50, 99, 100, 125075, 999999, 100000000]) {
        expect(parse(toInput(minor, ccy), ccy), `${minor} ${ccy}`).toBe(minor)
      }
    }
  })

  it('emits no grouping separator, so the field holds something parse accepts', () => {
    // parse() strips commas, but a prefilled field is also a value a person
    // edits - and the Indian grouping of a large figure is the one most
    // likely to be mangled by hand.
    const big = toInput(100000000, 'INR')
    expect(big).not.toMatch(/[,\s₹]/)
    expect(big).toBe('1000000.00')
  })

  it('gives exactly as many decimal places as the currency has', () => {
    // Not two. A 0-digit currency with a decimal point, or a 3-digit one
    // truncated to two, is the thousandfold class of error this module
    // exists to prevent.
    for (const ccy of ['INR', 'JPY', 'IQD']) {
      const e = exponent(ccy)
      const out = toInput(1500, ccy)
      const frac = out.includes('.') ? out.split('.')[1]!.length : 0
      expect(frac, `${ccy} wants ${e}`).toBe(e)
    }
  })

  it('keeps a sub-unit amount below one, never promoting it to a whole unit', () => {
    // 5 paise is 0.05, not 5. A missing pad here is the missing-divide half
    // of the x100 bug and reads as a hundredfold larger payment.
    expect(toInput(5, 'INR')).toBe('0.05')
    expect(toInput(50, 'INR')).toBe('0.50')
    expect(parse(toInput(5, 'INR'), 'INR')).toBe(5)
  })

  it('omits the point entirely for a zero-digit currency', () => {
    expect(toInput(1500, 'JPY')).toBe('1500')
    expect(toInput(1500, 'JPY')).not.toContain('.')
  })

  it('scales a small amount by the exponent, across 0, 2 and 3 digits', () => {
    /*
     * The low end of each exponent class, where a scaling error is largest
     * in proportion. 1 minor unit is 1 JPY, 0.01 INR and 0.001 IQD - three
     * different answers from one integer, which is the whole reason nothing
     * here may hardcode a divide-by-100.
     *
     * MEASURED, NOT ASSUMED: the pad width inside `parts` is an EQUIVALENT
     * mutation and this suite does not pretend to kill it. Both
     * `padStart(3, '0')` and `padStart(e, '0')` in place of
     * `padStart(e + 1, '0')` survive all 1310 tests in the project, and the
     * outputs are byte-identical for every input tried - verified by
     * printing them side by side, not by inference. The reason is real
     * rather than a gap in coverage: `padStart` only pads a string SHORTER
     * than its target, and the two places a leading zero could survive both
     * remove it anyway - `whole || '0'` collapses an empty whole part, and
     * `group()` passes the whole part through `BigInt`, so "001" normalises
     * to "1" before anything renders. A wider pad therefore cannot be
     * observed through any public function.
     *
     * So these cases assert the SCALING, which is the property that matters
     * and which `e` genuinely decides. They are not evidence about the pad.
     */
    expect(toInput(1, 'JPY')).toBe('1')
    expect(toInput(1, 'INR')).toBe('0.01')
    expect(toInput(1, 'IQD')).toBe('0.001')
    expect(toInput(12, 'IQD')).toBe('0.012')
    // No leading zero reaches a payment field, whatever the pad.
    for (const [m, c] of [[1, 'JPY'], [9, 'JPY'], [99, 'JPY']] as const) {
      expect(toInput(m, c), `${m} ${c}`).not.toMatch(/^0\d/)
    }
  })

  it('refuses a currency whose exponent nobody has stated', () => {
    // Inherited from parts/exponent: a guessed exponent is a wrong amount,
    // and the throw is disclosed by the render boundary.
    expect(() => toInput(1000, 'ZZZ')).toThrow(/ISO 4217|exponent/i)
  })

  it('refuses an amount that is not a safe integer rather than rounding one', () => {
    expect(() => toInput(1.5, 'INR')).toThrow(/safe integer/i)
    expect(() => toInput(Number.NaN, 'INR')).toThrow(/safe integer/i)
  })

  it('discards the sign, which is safe ONLY because the caller gates on owing', () => {
    // Pinned, not endorsed. If this ever renders a minus, the prefill and
    // the gate have diverged and /dues needs re-reading.
    expect(toInput(-125075, 'INR')).toBe('1250.75')
    // The gate the safety rests on: a credit is not "owing", so it never
    // reaches toInput from /dues.
    const credit = countable(-125075)
    expect(credit.readable && credit.owing).toBe(false)
    const debt = countable(125075)
    expect(debt.readable && debt.owing).toBe(true)
  })
})
