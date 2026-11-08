/*
 * A FLAG'S PERIOD: A MONTH OR A FINANCIAL YEAR.
 *
 * `chain/kinds/ledger.v1.md` gives a flag's `period` two shapes, `YYYY-MM`
 * and `YYYY-YY`, and both are seven characters with a hyphen at index 4. The
 * disputes screen told them apart by whether the second half was <= 12, which
 * is wrong three ways - see lib/format.ts. All three reach a resident reading
 * a dispute about their own money.
 *
 * The shapes are read out of the contract rather than written here, so a third
 * shape added to that row fails this suite instead of silently rendering as a
 * month - the same reason flatSetLabel's test reads its values from the
 * contract, after `flat` arrived and a one-flat charge read as "Every flat".
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fyOf, month, period, periodLabel } from './format'

const LEDGER = resolve(__dirname, '../../../contracts/chain/kinds/ledger.v1.md')

const contractPeriodShapes = (): string[] => {
  const row = readFileSync(LEDGER, 'utf8')
    .split('\n')
    .find((l) => /^\|\s*\d+\s*\|\s*`period`\s*\|/.test(l))
  if (!row) throw new Error(`no period row in ${LEDGER}`)
  const shapes = [...row.matchAll(/`(Y{4}-(?:MM|YY))`/g)].map((m) => m[1]!)
  if (shapes.length === 0) throw new Error(`period row lists no shapes: ${row}`)
  return shapes
}

describe('a flag period is a month or a financial year', () => {
  it('still finds both shapes in the contract', () => {
    // Vacuity guard: a renamed row must throw rather than let the cases
    // below assert over an empty list.
    expect(contractPeriodShapes().toSorted()).toEqual(['YYYY-MM', 'YYYY-YY'])
  })

  it('reads a financial year as a year even when it looks like a month', () => {
    /* THE DEFECT. `2011-12` is FY 2011-12 and was read as December 2011: a
     * dispute raised about a whole year, named on screen as one month of it.
     * Every financial year ending in a year 00-12 of its century collided. */
    for (const fy of ['2009-10', '2010-11', '2011-12', '2000-01']) {
      expect(period(fy).kind, fy).toBe('fy')
      expect(periodLabel(fy), fy).toBe(`FY ${fy}`)
    }
  })

  it('accepts every financial year fyOf itself produces', () => {
    /* The over-tightening guard. These are the only FY strings this app ever
     * writes, so a rule that rejected one would hide the period on a dispute
     * about a year the society actually closed - and an unlabelled period
     * looks like a dispute about nothing in particular. */
    for (let y = 2026; y < 2126; y++) {
      for (const startMonth of [1, 4, 7]) {
        const fy = fyOf(`${y}-06-15`, startMonth)
        expect(period(fy).kind, fy).toBe('fy')
        expect(periodLabel(fy), fy).toBe(`FY ${fy}`)
      }
    }
  })

  it('reads a month as a month, across the whole year', () => {
    for (let m = 1; m <= 12; m++) {
      const p = `2026-${String(m).padStart(2, '0')}`
      expect(period(p).kind, p).toBe('month')
      // Asserted against month() rather than a literal: the label is Intl's
      // business, and this suite exists to assert the DECISION.
      expect(periodLabel(p), p).toBe(month(p))
    }
  })

  it('never names a month for a period it could not read', () => {
    /* Naming the wrong period on a dispute is worse than disclosing that the
     * period is unrecorded, so an unreadable one is never a month and never
     * the bare value with a prefix glued on - "FY null" was on screen. */
    const bad = [null, undefined, '', '2026', '2026-', '2026-00', '2026-13', '2026-99',
      '202-03', '2026/03', 'FY 2026', '2026-0a', ' 2026-03', '2026-03 ', '2026-3']
    for (const p of bad) {
      const label = JSON.stringify(p)
      expect(period(p).kind, label).toBe('unreadable')
      expect(periodLabel(p), label).toBe('An unrecorded period')
      if (p) expect(periodLabel(p), label).not.toContain(p.trim())
    }
  })

  it('does not throw on any period a hostile server could send', () => {
    /* month() reaches Intl.format, and Intl.format on a NaN date is a
     * RangeError - thrown during render inside a list item, with no error
     * boundary anywhere in the tree, so the whole disputes screen blanks
     * rather than one line reading oddly. */
    const hostile = [null, undefined, '', '2026-00', '2026-13', 'xxxx-xx', '0000-00',
      '9999-99', '2026-03-01', '--', '2026-+1', '2026-1e1', '…0-03']
    for (const p of hostile) {
      expect(() => periodLabel(p), JSON.stringify(p)).not.toThrow()
      expect(() => period(p), JSON.stringify(p)).not.toThrow()
    }
  })

  it('answers exactly one kind for any input', () => {
    // No input may fall through to undefined: the route branches on `kind`.
    for (const p of ['2026-03', '2025-26', 'nonsense', null]) {
      expect(['month', 'fy', 'unreadable'], String(p)).toContain(period(p).kind)
    }
  })
})
