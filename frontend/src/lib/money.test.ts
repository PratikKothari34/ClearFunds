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

  it('tolerates grouping and spacing a person would type', () => {
    expect(parseMoney('1,20,000.50', 'INR')!.minor).toBe(12000050)
    expect(parseMoney('  400 ', 'INR')!.minor).toBe(40000)
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
      expect(parseMoney(formatted.replace(/[A-Z\s]/g, ''), 'INR')!.minor).toBe(
        m.minor,
      )
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
