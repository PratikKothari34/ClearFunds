import { describe, expect, it, vi } from 'vitest'
import {
  formatMoney,
  formatParts,
  minorUnitDigits,
  parseMoney,
} from './money'

/*
 * The project names the x100 input boundary as where bugs will live: a
 * missing multiply stores Rs 12.50 as Rs 0.125, a plausible amount that
 * will not look wrong in a list. These tests are aimed at the boundary,
 * not at the arithmetic.
 */

describe('minorUnitDigits', () => {
  it('reads the exponent from the currency, not a hardcoded 100', () => {
    expect(minorUnitDigits('INR')).toBe(2)
    expect(minorUnitDigits('JPY')).toBe(0)
    expect(minorUnitDigits('KWD')).toBe(3)
  })
})

describe('parseMoney', () => {
  it('scales major units to minor units', () => {
    expect(parseMoney('1250.75', 'INR')).toEqual({
      minor: 125075,
      currency: 'INR',
    })
  })

  it('scales a two-decimal amount that floats would get wrong', () => {
    // 12.50 * 100 is 1250.0000000000002 in binary floating point. Parsing
    // by string means the result is exact, not rounded-and-hopefully-right.
    expect(parseMoney('12.50', 'INR')!.minor).toBe(1250)
    expect(parseMoney('0.07', 'INR')!.minor).toBe(7)
    expect(parseMoney('8.11', 'INR')!.minor).toBe(811)
  })

  it('does not drop the multiply: 12.50 is never 1250 minor-as-12.50', () => {
    // The failure this guards: returning 12.5 (major) where 1250 (minor)
    // is meant. An integer check catches it; an eyeball does not.
    const m = parseMoney('12.50', 'INR')!
    expect(Number.isInteger(m.minor)).toBe(true)
    expect(m.minor).not.toBe(12.5)
  })

  it('pads a short fraction rather than misreading it', () => {
    expect(parseMoney('5.5', 'INR')!.minor).toBe(550)
    expect(parseMoney('5.', 'INR')!.minor).toBe(500)
    expect(parseMoney('5', 'INR')!.minor).toBe(500)
  })

  it('scales by the currency, so JPY and KWD differ', () => {
    expect(parseMoney('1250', 'JPY')!.minor).toBe(1250)
    expect(parseMoney('1.234', 'KWD')!.minor).toBe(1234)
  })

  it('tolerates the spacing a person would type', () => {
    expect(parseMoney('  400 ', 'INR')!.minor).toBe(40000)
    // U+00A0, which is what a paste out of a spreadsheet or a PDF
    // carries. \s does not match it, so stripping only \s left the
    // string unparseable and the person retyping an amount they
    // already typed correctly.
    expect(parseMoney('1 400.50', 'INR')!.minor).toBe(140050)
  })

  it('refuses a comma rather than guessing which separator it is', () => {
    // '12,50' is twelve rupees fifty paise to one person and twelve
    // thousand five hundred to another, and this function cannot tell
    // which from the string. Stripping commas picked the second
    // reading silently, storing Rs 1,250.00 for Rs 12.50 - a 100x
    // overstatement on an entry that looks entirely plausible in a
    // list. Null puts the question back to the person who knows.
    for (const ambiguous of ['12,50', '1,20,000.50', '1,250', '1,234.56']) {
      expect(parseMoney(ambiguous, 'INR'), ambiguous).toBeNull()
    }
  })

  it('keeps a negative sign', () => {
    expect(parseMoney('-75.25', 'INR')!.minor).toBe(-7525)
  })

  it('refuses more decimals than the currency has', () => {
    // Rather than rounding away a digit the person deliberately typed.
    expect(parseMoney('10.999', 'INR')).toBeNull()
    expect(parseMoney('10.5', 'JPY')).toBeNull()
  })

  it('refuses junk instead of returning zero', () => {
    // A caller must treat null as "do not submit". Returning 0 here would
    // post an entry of zero rupees against a real approval.
    for (const bad of ['', '   ', 'abc', '1.2.3', '12-', 'Rs 50', '1e3', '--5']) {
      expect(parseMoney(bad, 'INR'), bad).toBeNull()
    }
  })

  it('refuses an amount beyond exact integer range', () => {
    expect(parseMoney('99999999999999999', 'INR')).toBeNull()
  })
})

describe('formatMoney', () => {
  it('groups in lakhs and crores for en-IN', () => {
    const out = formatMoney({ minor: 120000000, currency: 'INR' })
    // 12,00,000.00 rupees -- not 1,200,000.00
    expect(out).toContain('12,00,000.00')
  })

  it('round-trips through parse without drift', () => {
    for (const s of ['0.01', '12.50', '1250.75', '99999.99']) {
      const m = parseMoney(s, 'INR')!
      const formatted = formatMoney(m, { showSymbol: false })

      /*
       * The commas come OUT here, which is the asymmetry on purpose.
       * Display groups digits because a resident reads 1,20,000 faster
       * than 120000; input refuses a comma because it cannot tell a
       * thousands separator from a decimal point. So a round trip has
       * to undo the grouping the formatter added, and nothing may feed
       * a formatted string back into parseMoney in the app.
       */
      const digits = formatted.replace(/[A-Z\s, ]/g, '')
      expect(parseMoney(digits, 'INR')!.minor).toBe(m.minor)
    }
  })

  it('shows no decimals for JPY and three for KWD', () => {
    expect(formatMoney({ minor: 1250, currency: 'JPY' })).not.toContain('.')
    expect(formatMoney({ minor: 1234, currency: 'KWD' })).toContain('1.234')
  })

  it('formats zero without a sign', () => {
    expect(formatMoney({ minor: 0, currency: 'INR' })).not.toContain('-')
  })
})

describe('formatParts', () => {
  it('splits so a column can align on the decimal separator', () => {
    const p = formatParts({ minor: 125075, currency: 'INR' })
    expect(p.integer).toContain('1,250')
    expect(p.fraction).toBe('75')
    expect(p.symbol).not.toBe('')
  })

  it('keeps the minus sign with the integer part', () => {
    const p = formatParts({ minor: -7525, currency: 'INR' })
    expect(p.integer).toContain('-')
    expect(p.fraction).toBe('25')
  })
})

describe('formatter reuse', () => {
  it('constructs at most one formatter per locale and currency', () => {
    // The ledger is virtualized: a scroll re-renders every visible row.
    // Without memoization this constructor runs once per amount per
    // frame, which the design calls out as measurable in a long table.
    // Behaviour is identical either way, so only a test catches its
    // removal.
    const spy = vi.spyOn(Intl, 'NumberFormat')
    try {
      // Warm, so the assertion measures the steady state rather than
      // the first call of the process.
      formatMoney({ minor: 1, currency: 'INR' })
      spy.mockClear()

      for (let i = 0; i < 50; i++) {
        formatMoney({ minor: i * 125, currency: 'INR' })
      }
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('still formats a second currency correctly from a warm cache', () => {
    // A cache keyed too loosely would return the INR formatter for JPY
    // and print a rupee symbol with two decimals on a zero-decimal
    // currency.
    formatMoney({ minor: 125000, currency: 'INR' })
    expect(formatMoney({ minor: 1250, currency: 'JPY' })).not.toContain('.')
    expect(formatMoney({ minor: 125075, currency: 'INR' })).toContain('.75')
  })
})

describe('precision near the safe-integer ceiling', () => {
  it('never alters the digits of an amount parseMoney would accept', () => {
    /*
     * The bug this caught: formatMoney divided by 10**digits in binary
     * floating point. Above roughly 2^53/100 the gap between adjacent
     * doubles exceeds one paisa, so 9007199254740991 printed as
     * ...409.90 where the true value ends ...409.91 - a digit lost in
     * the DIVISION, which is why pinning the fraction digits did not
     * save it: Intl rounded a quotient that was already wrong.
     *
     * The fix hands Intl an exact decimal STRING, which it parses
     * losslessly. parseMoney accepts anything up to MAX_SAFE_INTEGER,
     * so format must be exact over that whole range or the two
     * disagree about what the product can represent.
     */
    const wrong: number[] = []
    for (const minor of [
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER - 1,
      9_007_199_254_740_001,
      4_503_599_627_370_497,
      1_000_000_000_000_001,
    ]) {
      const out = formatMoney({ minor, currency: 'INR' }, { showSymbol: false })
      if (out.replace(/\D/g, '') !== String(minor)) wrong.push(minor)
    }
    expect(wrong).toEqual([])
  })

  it('round-trips the largest amount each currency can hold', () => {
    // Three different minor-unit scales, each at the ceiling, because
    // the division that was wrong was by 10**digits.
    for (const [currency, typed] of [
      ['INR', '90071992547409.91'],
      ['JPY', '9007199254740991'],
      ['KWD', '9007199254740.991'],
    ] as const) {
      const m = parseMoney(typed, currency)
      expect(m, `${currency} ${typed} parses`).not.toBeNull()
      const digits = formatMoney(m!, { showSymbol: false }).replace(/\D/g, '')
      expect(digits, `${currency} round trip`).toBe(String(m!.minor))
    }
  })
})

describe('negative zero', () => {
  it('parseMoney does not return a signed zero', () => {
    /*
     * '-0' and '-0.00' are things a person types mid-correction. A -0
     * compares equal to 0 while reading as negative to every sign
     * test, so `minor < 0 ? 'debit' : 'credit'` and
     * `Object.is(minor, -0)` disagree about the same value.
     */
    for (const typed of ['-0', '-0.00', '-0.0']) {
      const m = parseMoney(typed, 'INR')
      expect(m, typed).not.toBeNull()
      expect(Object.is(m!.minor, -0), typed).toBe(false)
      expect(m!.minor, typed).toBe(0)
    }
  })

  it('formatMoney prints no minus sign for a zero that arrived signed', () => {
    // Intl formats -0 as "-Rs 0.00". A minus in front of a zero
    // balance reads as the society being very slightly overdrawn.
    expect(formatMoney({ minor: -0, currency: 'INR' })).not.toContain('-')
    expect(formatParts({ minor: -0, currency: 'INR' }).integer).not.toContain(
      '-',
    )
  })
})

describe('a malformed currency code from the server', () => {
  it('degrades instead of throwing, so one bad field does not blank the route', () => {
    /*
     * `new Intl.NumberFormat(locale, { currency: '' })` throws a
     * RangeError. Thrown during render it takes down the whole route -
     * the ledger, the balance, every amount on screen - over one
     * malformed field, where showing the digits without a symbol would
     * have told the resident almost everything they came for.
     */
    for (const bad of ['', 'rupees', 'IN', 'INRR', '123']) {
      expect(
        () => formatMoney({ minor: 125075, currency: bad }),
        bad,
      ).not.toThrow()
      expect(() => formatParts({ minor: 125075, currency: bad }), bad).not.toThrow()
      // And the digits still survive, which is the point of degrading
      // rather than rendering nothing.
      expect(
        formatMoney({ minor: 125075, currency: bad }).replace(/\D/g, ''),
        bad,
      ).toContain('125075')
    }
  })

  it('still reports a usable minor-unit scale for an unknown currency', () => {
    // minorUnitDigits throws from the same constructor. Falling back to
    // 2 is a guess, but a guess that keeps the page up and is right for
    // most currencies; throwing is right for none.
    expect(() => minorUnitDigits('')).not.toThrow()
    expect(minorUnitDigits('')).toBe(2)
  })
})
