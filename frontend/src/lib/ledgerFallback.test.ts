import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LEDGER_UNREACHED_EXPLANATION,
  LEDGER_UNREACHED_HEADING,
} from './ledgerFallback'

const TABS = [
  'src/routes/ledger.index.tsx',
  'src/routes/ledger.flagged.tsx',
  'src/routes/ledger.reversed.tsx',
]

describe('the ledger failure copy', () => {
  it('refuses the reading that would alarm a resident', () => {
    /*
     * ASSERTS THE RULE, NOT THE SENTENCE. Checking the exact string
     * would make this test a copy of the copy - the next rewording
     * "fixes" it by pasting the new words in, and nothing is guarded.
     *
     * The rule is that the text must deny the empty-ledger reading. A
     * screen that lists nothing is indistinguishable from a society
     * that has recorded nothing, and telling those apart is the whole
     * product.
     */
    expect(LEDGER_UNREACHED_EXPLANATION).toMatch(/not a statement/i)
    expect(LEDGER_UNREACHED_EXPLANATION).toMatch(/no entries/i)
    // And it must say the record is intact, because a resident's next
    // thought on a failed load is that something was deleted.
    expect(LEDGER_UNREACHED_EXPLANATION).toMatch(/nothing has been changed/i)
  })

  it('does not claim the ledger is empty', () => {
    expect(LEDGER_UNREACHED_HEADING).not.toMatch(/\bno entries\b|\bempty\b/i)
  })

  it('is used by every ledger tab and inlined by none', () => {
    /*
     * The three tabs each had their own byte-identical copy. The
     * failure this guards is the PARTIAL edit: one tab reworded, two
     * left alone, and the tab a resident opened is the short one.
     */
    for (const file of TABS) {
      const code = readFileSync(resolve(process.cwd(), file), 'utf8')

      // Control: the file was read and still renders a fallback.
      expect(code.length, `${file} is empty`).toBeGreaterThan(200)
      expect(code, `${file} has no fallback`).toMatch(/BandFallback/)

      expect(code, `${file} does not use the shared copy`).toMatch(
        /LEDGER_UNREACHED_EXPLANATION/,
      )
      /*
       * And no literal re-inlined beside it. Matched on a distinctive
       * fragment rather than the whole sentence, so a reworded shared
       * constant does not make this check pass by accident.
       */
      expect(code, `${file} inlines the failure copy again`).not.toMatch(
        /The ledger did not load/,
      )
    }
  })
})
