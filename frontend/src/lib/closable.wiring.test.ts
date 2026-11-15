import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/*
 * THAT BOTH SCREENS DECIDE FROM `closable`, WHICH closable.test.ts CANNOT SEE.
 *
 * closable.test.ts proves the function answers correctly, and five mutants
 * die against it. It passes just as happily when nothing calls the function:
 * the defect it was written for was not a wrong answer, it was `/reports`
 * printing "Only the appointed auditor closes the year" with no control
 * beside it, while `/year-end` decided the same question from its own inline
 * `mine && y.ended && !y.closed`. Two screens, one rule, derived twice - and
 * the one that re-derived it reached a different conclusion about whether to
 * show anything at all.
 *
 * So the decision function is the reporter here and the CALL is the decision.
 * A re-derived check beside a correct `closable` is the regression, and it
 * typechecks, passes every unit test, and reads as careful code.
 *
 * Asserting on source text is the weaker kind of test and it is deliberate,
 * for the reason boundary.wiring.test.ts gives: the alternative is mounting
 * the whole router, and the `offer` arms live inside a route body that is not
 * exported. Rebuilding that JSX in a test would test the copy - it stays
 * green after the real branch is deleted. Reading the real file does not.
 *
 * Comments are stripped first. This file's own prose names every identifier
 * it looks for, and so does reports.tsx's: a bare substring search over raw
 * text would pass on a file that only TALKS about closable.
 */

const SRC = join(import.meta.dirname, '..')

/** Strip block and line comments, the trap csp.test.ts documents. */
function code(rel: string): string {
  const raw = readFileSync(join(SRC, rel), 'utf8')
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const SCREENS = ['routes/reports.tsx', 'routes/year-end.tsx'] as const

describe('both screens read the shared rule', () => {
  for (const rel of SCREENS) {
    it(`${rel} imports closable from lib`, () => {
      expect(code(rel)).toMatch(/import\s*\{\s*closable\s*\}\s*from\s*['"]\.\.\/lib\/closable['"]/)
    })

    it(`${rel} calls it`, () => {
      // Anchored on the call, not the identifier: an import left behind by a
      // half-revert would otherwise satisfy the test above on its own.
      expect(code(rel)).toMatch(/closable\(/)
    })
  }

  /*
   * The re-derivation guard, and the reason this file exists.
   *
   * `auditor_for` is the field `closable` tests. A screen that reaches for it
   * directly is deciding the same question a second time, which is what
   * `/year-end` was doing when `/reports` had no control at all. The server
   * still owns the refusal either way, so this never fails as a security
   * hole - it fails as two screens disagreeing about who is offered an
   * irreversible action, which is the harder bug to see.
   */
  for (const rel of SCREENS) {
    it(`${rel} does not consult auditor_for itself`, () => {
      expect(code(rel)).not.toMatch(/auditor_for/)
    })
  }

  /*
   * `ended` and `closed` are the other two clauses. Reading them to decide
   * whether to OFFER the close is the same re-derivation; reading them to
   * describe the year is not, and `/year-end` legitimately does the latter -
   * its status chip prints "Ended, open" against "In progress" and its card
   * border highlights a closed year. So this asserts the shape that is
   * actually wrong: `ended`/`closed` combined with a logical operator, which
   * is a gate rather than a label.
   */
  for (const rel of SCREENS) {
    it(`${rel} does not rebuild the gate from ended and closed`, () => {
      const src = code(rel)
      expect(src).not.toMatch(/&&\s*!?\w*\.?(ended|closed)\b/)
      expect(src).not.toMatch(/\.(ended|closed)\s*&&/)
    })
  }

  it('reports.tsx renders the control only for the closable answer', () => {
    const src = code('routes/reports.tsx')
    // The offer is gated on the string `closable`, never on truthiness of
    // the whole result: `offer &&` would show the button to every answer
    // including `closed` and `not_mine`, which is the dead end inverted into
    // offering a resident a button that was never theirs.
    expect(src).toMatch(/offer\s*===\s*'closable'/)
    expect(src).not.toMatch(/\{\s*offer\s*&&/)
  })

  it('reports.tsx leaves the offer undecided while the years read is in flight', () => {
    /*
     * An absent year must not render as an answer. `years.data?.find(...)`
     * returns undefined while the read is pending AND when it fails, and
     * `closable` has no outcome for "I do not know yet" - calling it with a
     * fabricated year would assert `not_mine` about an auditor whose
     * appointment simply has not loaded. The conditional call is the guard.
     */
    expect(code('routes/reports.tsx')).toMatch(/thisYear\s*\?\s*closable\(/)
  })

  it('year-end.tsx gates the close sheet on the closable answer', () => {
    const src = code('routes/year-end.tsx')
    expect(src).toMatch(/closable\(me,\s*y\)/)
    expect(src).toMatch(/===\s*'closable'/)
  })
})
