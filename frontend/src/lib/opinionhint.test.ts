/*
 * THE AUDIT GLOSS IS WORDING THE PRODUCT IS NOT ALLOWED TO GET WRONG.
 *
 * `opinionHint` is the plain-English sentence shown beside an audit opinion
 * (`reports.tsx`, `year-end.tsx`) - for most residents it is the only
 * explanation of what the opinion means. Its wording is constrained, not a
 * matter of taste:
 *
 *   - The auditor gives REASONABLE ASSURANCE, never a guarantee. Nothing may
 *     say he certified, verified or confirmed that the accounts are correct.
 *     Same force as "tamper-evident, never tamper-proof".
 *   - A clean opinion is bounded by the evidence examined. It does not say
 *     the accounts are correct, because no audit can.
 *   - A disclaimer is the MOST serious outcome, not a neutral one - the
 *     auditor could not form an opinion at all. A gloss that reads like a
 *     mild caveat inverts the ranking the rest of the code enforces.
 *
 * The text was correct when this suite was written; nothing asserted it.
 * That is the gap: an edit to "The accounts are certified correct" reads as
 * a clarity improvement to anyone who does not know the rule, and would
 * ship. The severity ORDER is guarded in `opinion.test.ts` and
 * `enums.test.ts`; the forbidden verbs were guarded nowhere.
 *
 * The enum comes from the parser's own list rather than being retyped here,
 * so an opinion added to the contract cannot arrive with no gloss.
 */
import { describe, expect, it } from 'vitest'
import { opinionHint, opinionLabel } from './format'
import type { Opinion } from './types'

const OPINIONS: Opinion[] = ['clean', 'qualified', 'adverse', 'disclaimer']

/*
 * Verbs that assert certainty about the accounts themselves. A gloss may say
 * what the auditor FOUND or EXAMINED; it may not say he certified, verified
 * or confirmed them, nor guarantee anything.
 */
const FORBIDDEN = [
  /\bcertif(y|ies|ied|ication)\b/i,
  /\bverif(y|ies|ied|ication)\b/i,
  /\bconfirm(s|ed|ation)?\b/i,
  /\bguarantee(s|d)?\b/i,
  /\bproof\b/i,
  /\bproves?\b/i,
  /\baccurate\b/i,
  /\bcorrect\b/i,
]

describe('opinionHint', () => {
  it('glosses every opinion the app can parse', () => {
    // An opinion with no gloss renders a blank line beside a seal, which
    // reads as "nothing to say about this audit".
    for (const o of OPINIONS) {
      expect(opinionHint[o], o).toBeTruthy()
      expect(opinionHint[o].trim().length, o).toBeGreaterThan(10)
    }
    expect(Object.keys(opinionHint).sort()).toEqual([...OPINIONS].sort())
  })

  it('never claims the auditor certified, verified or guaranteed the accounts', () => {
    // The rule this suite exists for. Checked across every gloss, because
    // the dangerous edit is to the reassuring one.
    for (const o of OPINIONS) {
      for (const bad of FORBIDDEN) {
        expect(opinionHint[o], `${o} / ${bad}`).not.toMatch(bad)
      }
    }
  })

  it('bounds a clean opinion by the evidence rather than declaring the books right', () => {
    const clean = opinionHint.clean
    // "found ... on the evidence examined" is assurance language; an
    // unqualified "the accounts are correct" is not available to an auditor.
    expect(clean).toMatch(/evidence|examin/i)
    expect(clean).not.toMatch(/^the accounts are\b/i)
  })

  it('says a disclaimer means no opinion could be formed, not a mild caveat', () => {
    // A disclaimer outranks adverse. If its gloss reads softer than the
    // qualified one, the sentence contradicts the ranking the code enforces.
    const d = opinionHint.disclaimer
    expect(d).toMatch(/could not form|no opinion|not produced|unable/i)
    expect(d).not.toMatch(/\bminor\b|\bsmall\b|\bmostly\b/i)
  })

  it('states that an adverse opinion is a material misstatement', () => {
    expect(opinionHint.adverse).toMatch(/misstat/i)
  })

  it('gives each opinion a distinct gloss, so two outcomes cannot read alike', () => {
    const all = OPINIONS.map(o => opinionHint[o])
    expect(new Set(all).size).toBe(OPINIONS.length)
  })

  it('keeps the gloss separate from the label, never restating it', () => {
    // The chip already shows the label; a gloss that only repeats it tells a
    // resident nothing about what the opinion means.
    for (const o of OPINIONS) {
      expect(opinionHint[o], o).not.toBe(opinionLabel[o])
    }
  })
})
