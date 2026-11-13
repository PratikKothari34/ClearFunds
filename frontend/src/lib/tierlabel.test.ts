/*
 * THE TIER ARITHMETIC WAS GUARDED; THE SENTENCE A COMMITTEE READS WAS NOT.
 *
 * `tier.test.ts` pins the rule - at least two-thirds of the committee,
 * rounded up, never a rounding down. Nothing asserted `tierLabel`, which is
 * the only place that answer is put into words. Inverting its branch
 * (`=== 'pair'` to `!== 'pair'`) left ALL 1288 tests green.
 *
 * That mutant is not a cosmetic one. Two surfaces render the label:
 *
 *   - `approvals.tsx` shows "Needs <label>" on a proposal awaiting votes, so
 *     an inverted label tells a committee member a 5-of-7 proposal needs two
 *     named officers, or that a two-officer proposal needs a committee vote.
 *   - `entry.$seq.tsx` renders the label beside a clause built from `p.tier`
 *     READ AGAIN at the call site, so under the mutant the two halves of one
 *     sentence disagree: "Needed Treasurer + Secretary, above the limit then
 *     in force". A resident auditing how an entry was approved reads two
 *     incompatible claims and cannot tell which is true.
 *
 * So this suite asserts the label is DERIVED from the tier, not merely that
 * each tier has some label. The enum comes out of the contract
 * (`contracts/chain/kinds/ledger.v1.md`) rather than being written here: a
 * third tier added there must fail this suite rather than silently render as
 * whichever branch the ternary falls through to - the defect that let a
 * third `flat_set` value render as its opposite earlier in this project.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tierLabel } from './format'

const CONTRACT = resolve(__dirname, '../../../contracts/chain/kinds/ledger.v1.md')

/*
 * The contract's field table states the tier enum as:
 *   | 19 | `tier` | text | `pair` (treasurer **and** secretary) or `committee` |
 * Parsed rather than copied, and an empty parse fails: a reformat of that
 * table must break this suite instead of leaving it iterating nothing.
 */
function contractTiers(): string[] {
  const md = readFileSync(CONTRACT, 'utf8')
  const row = md.split('\n').find(l => /^\|\s*\d+\s*\|\s*`tier`/.test(l))
  if (!row) return []
  return [...row.matchAll(/`([a-z_]+)`/g)].map(m => m[1]!).filter(v => v !== 'tier')
}

const proposal = (tier: string, over: Record<string, unknown> = {}) =>
  ({ tier, required: 5, seated: 7, ...over }) as Parameters<typeof tierLabel>[0]

describe('tierLabel', () => {
  const tiers = contractTiers()

  it('finds the tier enum in the contract at all', () => {
    expect(tiers.length).toBeGreaterThanOrEqual(2)
  })

  it('knows every tier the contract defines, and no more', () => {
    // A tier added to the contract lands here, not in production as the
    // wrong branch of a two-way ternary.
    expect([...tiers].sort()).toEqual(['committee', 'pair'])
  })

  it('names the two officers for the pair tier, never a count', () => {
    // The contract glosses `pair` as treasurer AND secretary, and the rule
    // is that this tier never reduces to one person - so the label must name
    // both rather than say "2 of N", which reads as any two admins.
    const label = tierLabel(proposal('pair'))
    expect(label).toMatch(/treasurer/i)
    expect(label).toMatch(/secretary/i)
    expect(label).not.toMatch(/\d/)
  })

  it('reports the committee tier as a count out of those seated', () => {
    const label = tierLabel(proposal('committee', { required: 5, seated: 7 }))
    expect(label).toContain('5')
    expect(label).toContain('7')
    expect(label).toMatch(/committee/i)
  })

  it('derives the label from the tier, so the branches cannot be swapped', () => {
    // The assertion the inverted mutant breaks: each tier's label must be
    // the OTHER tier's wrong answer, not merely non-empty.
    expect(tierLabel(proposal('pair'))).not.toEqual(tierLabel(proposal('committee')))
    expect(tierLabel(proposal('pair'))).not.toMatch(/\d+ of \d+/)
    expect(tierLabel(proposal('committee'))).toMatch(/\d+ of \d+/)
  })

  it('tracks the seated count rather than hardcoding a committee size', () => {
    // Statutory strength is 11-13 for this market, so a label that assumed
    // one size would be wrong for the other; assert the rule, not a number.
    const small = tierLabel(proposal('committee', { required: 8, seated: 11 }))
    const large = tierLabel(proposal('committee', { required: 9, seated: 13 }))
    expect(small).not.toEqual(large)
    expect(small).toContain('11')
    expect(large).toContain('13')
  })
})
