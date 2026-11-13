import { describe, expect, it } from 'vitest'
import { duesTile } from './duestile'
import { exponent, format, parts } from './money'

describe('duesTile', () => {
  it('names the exact amount owed, not just that the flat owes', () => {
    const t = duesTile('A-102', 355026, 'INR')
    expect(t.state).toBe('owes')
    expect(t.label).toBe(`A-102, owes ${format(355026, 'INR')}`)
    // The exact figure keeps its minor units, which the tile itself drops.
    expect(t.label).toContain(`.${parts(355026, 'INR').fraction}`)
  })

  it('prints whole units on the tile', () => {
    const t = duesTile('A-102', 355026, 'INR')
    expect(t.state === 'owes' && t.figure).toBe(parts(355026, 'INR').whole)
  })

  it.each(['JPY', 'KWD', 'INR'])('formats with the currency it is given (%s), never a literal', (cur) => {
    const minor = 10 ** (exponent(cur) + 3) + 7
    const t = duesTile('B-1', minor, cur)
    expect(t.label).toBe(`B-1, owes ${format(minor, cur)}`)
    expect(t.state === 'owes' && t.figure).toBe(parts(minor, cur).whole)
  })

  it.each([0, -500])('calls a flat with nothing outstanding settled (%s)', (minor) => {
    expect(duesTile('A-101', minor, 'INR')).toEqual({ state: 'settled', label: 'A-101, settled' })
  })

  it.each([null, undefined, '3550', 1.5, Number.NaN, 2 ** 60])('never calls an unreadable figure settled (%s)', (v) => {
    const t = duesTile('A-103', v, 'INR')
    expect(t.state).toBe('unknown')
    expect(t.label).toBe('A-103, amount could not be read')
    expect(t.label).not.toMatch(/settled|owes/)
  })
})
