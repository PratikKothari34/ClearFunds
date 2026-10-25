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

/*
 * THE SAME RULE, APPLIED TO THREE QUIETER CLAIMS.
 *
 * `/verify` overstates loudly - tamper-proof is a word anyone would
 * challenge. These three overstate by OMISSION, which is harder to see
 * and lands on the reader as reassurance:
 *
 *   - the flagged tab said "Every question raised so far has been
 *     answered" while entries it could not read were silently dropped;
 *   - the year-end page printed "Closed <date>." and then nothing when
 *     no audit opinion was recorded, and a resident reads that silence
 *     as a clean year;
 *   - the sign-off card printed a raw entry count, so an unreadable
 *     figure rendered as junk beside real ones.
 *
 * Each is asserted over the SERVED TEXT with a control, the same shape
 * as the claim above, and each asserts the RULE - that the surface has
 * a branch for the unreadable case and names it - never a sample
 * number or a pinned sentence.
 */
describe('a surface that cannot read its data never claims the all-clear', () => {
  it('the flagged tab does not claim every question is answered when it could not check', () => {
    const file = 'src/routes/ledger.flagged.tsx'
    const text = servedText(file)

    // Controls: read, and still the surface that makes the claim.
    expect(text.length, `${file} stripped to nothing`).toBeGreaterThan(200)
    expect(text, `${file} no longer reads the flag count`).toMatch(
      /openFlagCount/,
    )

    /*
     * The reassuring sentence must be REACHABLE ONLY when nothing was
     * unreadable. Asserted as "the empty message is conditional on the
     * unreadable tally", because that is the rule; the wording of
     * either branch stays free to improve.
     */
    expect(
      text,
      `${file} never tallies the entries it could not check`,
    ).toMatch(/isUnreadableCount/)
    expect(
      text,
      `${file} states the all-clear unconditionally`,
    ).toMatch(/unreadable\.length\s*>\s*0\s*$|unreadable\.length\s*>\s*0/m)
    expect(
      text,
      `${file} has no wording for the case where it could not check`,
    ).toMatch(/not a statement/i)
  })

  it('the year-end page never lets a missing opinion read as a clean year', () => {
    const file = 'src/routes/year-end.tsx'
    const text = servedText(file)

    expect(text.length, `${file} stripped to nothing`).toBeGreaterThan(200)
    expect(text, `${file} no longer renders the close`).toMatch(/closedAt/)

    /*
     * `isClosed` tests `closedAt` alone - correct for blocking a
     * reversal, insufficient to claim a verdict exists. So the page
     * must branch on the OPINION's absence separately, and say what
     * the silence does not mean.
     */
    expect(
      text,
      `${file} does not branch on a missing opinion`,
    ).toMatch(/opinion\s*===\s*undefined/)
    expect(
      text,
      `${file} lets a missing opinion pass without saying what it is not`,
    ).toMatch(/not a statement/i)
  })

  it('the sign-off card never prints an entry count it could not read', () => {
    const file = 'src/routes/sign-off.tsx'
    const text = servedText(file)

    expect(text.length, `${file} stripped to nothing`).toBeGreaterThan(200)
    expect(text, `${file} no longer shows an entry count`).toMatch(
      /entryCount/,
    )

    /*
     * Guarded with `isUnreadableCount` and NOT `isShowableCount`: zero
     * entries in a month is a legitimate answer here, and
     * `isShowableCount` is false for zero, so the showable guard would
     * suppress a true figure. The distinction is the whole finding.
     */
    expect(
      text,
      `${file} prints entryCount with no guard against an unreadable one`,
    ).toMatch(/isUnreadableCount[\s\S]{0,200}entryCount|entryCount[\s\S]{0,200}isUnreadableCount/)
    expect(
      text,
      `${file} guards a count whose zero is legitimate with the showable guard`,
    ).not.toMatch(/isShowableCount\(\s*period\.entryCount/)
  })
})
