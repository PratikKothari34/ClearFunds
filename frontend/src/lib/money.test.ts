import { format, parse, exponent } from './money'

describe('money', () => {
  it('formats minor units with Indian grouping', () => {
    expect(format(125075, 'INR')).toBe('₹1,250.75')
    expect(format(1197324_25, 'INR')).toBe('₹11,97,324.25')
    expect(format(-25000_00, 'INR')).toBe('−₹25,000.00')
    expect(format(5, 'INR')).toBe('₹0.05')
    expect(format(300000, 'INR', { compact: true })).toBe('₹3,000')
    expect(format(12, 'INR', { signed: true })).toBe('+₹0.12')
  })
  it('respects the currency exponent, never a hardcoded ÷100', () => {
    expect(exponent('JPY')).toBe(0)
    expect(exponent('KWD')).toBe(3)
    expect(format(1500, 'JPY')).toBe('¥1,500')
    expect(parse('1.234', 'KWD')).toBe(1234)
    expect(parse('1.2', 'JPY')).toBeNull()
  })
  it('parses typed amounts without floating point', () => {
    expect(parse('1,250.75', 'INR')).toBe(125075)
    expect(parse('0.1', 'INR')).toBe(10)
    expect(parse('12500', 'INR')).toBe(1250000)
    expect(parse('₹ 3,250', 'INR')).toBe(325000)
    expect(parse('1.005', 'INR')).toBeNull()
    expect(parse('-5', 'INR')).toBeNull()
    expect(parse('abc', 'INR')).toBeNull()
    expect(parse('99999999999999999', 'INR')).toBeNull()
  })
})
