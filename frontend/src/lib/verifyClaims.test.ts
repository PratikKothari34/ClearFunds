import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THE STRONGEST COPY IN THE PRODUCT, AND NOTHING WAS ASSERTING IT.
 *
 * `/verify` carries the central security claim, and the project's rule
 * is stated in one line: tamper-EVIDENT, never tamper-PROOF. The claim
 * is that the record cannot be changed QUIETLY - never that it cannot
 * be forged by whoever runs the server, who can re-sign a whole chain.
 *
 * That distinction lives only in prose, which is exactly the kind of
 * rule that erodes: each rewrite makes the sentence a little more
 * confident, every individual edit reads as an improvement, and no
 * build fails. So the ban is asserted here, over the source of the
 * surfaces that make the claim.
 *
 * Asserted as FORBIDDEN PHRASINGS rather than as the exact approved
 * sentence. Pinning the sentence would make every honest rewording a
 * failure and train the check away; pinning the overstatements leaves
 * the copy free and the claim bounded.
 */

const CLAIM_SURFACES = [
  'src/routes/verify.tsx',
  'src/components/dashboard/FingerprintBand.tsx',
]

/** Comments are the reasoning, not the claim; only served text counts. */
function servedText(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/[^\n]*/g, '')
}

describe('the verification claim stays inside what the chain supports', () => {
  it('never says tamper-proof, or that change is impossible', () => {
    for (const file of CLAIM_SURFACES) {
      const text = servedText(file)

      // Controls: the file was read and still makes its claim.
      expect(text.length, `${file} stripped to nothing`).toBeGreaterThan(200)
      expect(text, `${file} no longer renders`).toMatch(/return/)

      expect(text, `${file} claims tamper-proof`).not.toMatch(
        /tamper[\s-]?proof/i,
      )
      /*
       * "not possible" / "impossible" / "cannot be changed" full stop.
       * The permitted form carries a qualifier - quietly, without being
       * seen, without this check showing it - so the bare absolute is
       * what is banned.
       */
      expect(
        text,
        `${file} says a change is impossible, not merely visible`,
      ).not.toMatch(/\bis not possible\b|\bimpossible\b/i)
      expect(text, `${file} promises the record cannot be changed`).not.toMatch(
        /cannot be (?:changed|altered|edited)(?![^.]*\bquietly\b)/i,
      )
    }
  })

  it('does not call a match proof', () => {
    /*
     * `verify.tsx`'s own header forbids leaving a resident believing
     * the check is proof. "Proves" appeared three times in the served
     * text, including in the bullet about the chain's real limit.
     */
    for (const file of CLAIM_SURFACES) {
      const text = servedText(file)
      expect(text, `${file} calls the check proof`).not.toMatch(
        /\bproves?\b|\bproof\b|\bguarantees?\b|\bcertif/i,
      )
    }
  })

  it('states the limit it cannot see as well as the one it can', () => {
    /*
     * BOTH HALVES OR NEITHER. A chain shows that nothing was changed
     * and shows nothing at all about an expense never entered. Shipping
     * only the first half is the overstatement the decision forbids,
     * and it is invisible from inside the page - every sentence there
     * is true.
     */
    const text = servedText('src/routes/verify.tsx')
    /*
     * BOTH CLAUSES, NOT EITHER.
     *
     * A first version of this allowed `never entered` OR `nothing is
     * missing`, and a mutation that deleted the limit clause outright
     * still passed - the earlier sentence ("cannot show you an expense
     * that was never entered at all") satisfied the first alternative
     * on its own. An alternation between a sentence that sets up the
     * limit and the sentence that states it will always be satisfied
     * by the setup alone.
     *
     * Whitespace is collapsed first because JSX wraps these sentences
     * across lines at no fixed column.
     */
    const flat = text.replace(/\s+/g, ' ')
    expect(flat, 'the missing-expense case is not raised').toMatch(
      /never entered at all/i,
    )
    expect(flat, 'the completeness limit is not stated').toMatch(
      /cannot show that nothing is missing/i,
    )
    expect(flat, 'the correctness limit is not stated').toMatch(
      /match does not mean an entry is correct/i,
    )
  })

  it('never claims the committee cannot forge, only that it shows', () => {
    // The operator CAN mint an approval; the published copy is what
    // makes it visible. Copy that denies the forgery outright is the
    // claim the trust model explicitly refuses to make.
    const text = servedText('src/routes/verify.tsx')
    expect(text).not.toMatch(/cannot (?:forge|fake|fabricate)/i)
  })
})
