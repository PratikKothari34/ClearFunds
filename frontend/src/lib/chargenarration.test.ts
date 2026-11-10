/**
 * THE HINT AND THE SUBMITTED VALUE MUST BE THE SAME SENTENCE.
 *
 * `/new` requires a note for every kind except `charge`: submit generates a
 * narration when the Title is blank. That was visible only as a placeholder,
 * which disappears on focus and reads as a suggestion of what to type - so
 * the one optional field looked identical to the two that block the button.
 *
 * Saying it in a hint introduced the real risk: two spellings of
 * `category === 'parking' ? ... : ...`, one beside the field and one in the
 * payload. Telling a treasurer the entry will read one thing and recording
 * another is exactly the small lie this ledger exists to make impossible, so
 * both sites call one function and this asserts they do.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultChargeNarration } from './format'

describe('defaultChargeNarration', () => {
  it('names parking separately from maintenance', () => {
    expect(defaultChargeNarration('parking', '2026-11')).toMatch(/^Parking /)
    expect(defaultChargeNarration('maintenance', '2026-11')).toMatch(/^Maintenance /)
  })

  it('treats any other category as maintenance, which is what submit does', () => {
    // Asserting the rule, not a sample: every non-parking category takes the
    // maintenance wording, including one added to the contract later.
    for (const c of ['maintenance', 'repairs', 'utilities', 'sinking_fund', '']) {
      expect(defaultChargeNarration(c, '2026-11'), c).toMatch(/^Maintenance /)
    }
  })

  it('carries the month the entry is dated, not the month it is typed in', () => {
    const nov = defaultChargeNarration('maintenance', '2026-11')
    const oct = defaultChargeNarration('maintenance', '2026-10')
    expect(nov).not.toBe(oct)
    expect(nov).toMatch(/2026/)
  })
})

/*
 * THAT BOTH SITES USE IT. The hint and the payload agreeing is the whole
 * point, and a second inline spelling passes every case above.
 */
describe('the new-entry screen uses one spelling', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'routes', 'new.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('THE DEFECT: no inline copy of the parking/maintenance choice remains', () => {
    expect(src).not.toMatch(/'parking'\s*\?\s*'Parking'/)
  })

  it('the submitted narration comes from the shared function', () => {
    expect(src).toMatch(/narration: note\.trim\(\) \|\| defaultChargeNarration\(/)
  })

  it('the hint beside the field comes from the same function', () => {
    expect(src).toMatch(/hint=\{kind === 'charge'[\s\S]{0,160}defaultChargeNarration\(/)
  })

  it('the hint says the field is optional', () => {
    // The reason the hint exists: the field looked required and was not.
    expect(src).toMatch(/Optional\./)
  })

  it('only the charge kind gets the optional hint', () => {
    /*
     * Receipt and expense DO require a note - `ready` blocks on it - so
     * telling those two they are optional would be the opposite lie.
     */
    expect(src).toMatch(/hint=\{kind === 'charge'\s*\?/)
    expect(src).toMatch(/:\s*undefined\}/)
  })
})
