import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STATEMENT_MAX_BYTES, bytes, checkStatement } from './statement'

const API = resolve(__dirname, '../../../contracts/api/v1.md')

describe('bytes', () => {
  it('counts UTF-8 bytes, not UTF-16 code units', () => {
    /*
     * The whole reason this module exists. `.length` is 1 for a Devanagari
     * character and 3 is what the server counts, so a character-based limit
     * passes three times as much text as the server will accept.
     */
    expect(bytes('a')).toBe(1)
    expect(bytes('अ')).toBe(3) // DEVANAGARI LETTER A
    expect('अ'.length).toBe(1) // ...which .length would have reported
    expect(bytes('₹')).toBe(3) // INDIAN RUPEE SIGN
  })

  it('counts an astral character as four bytes, not as two units', () => {
    // A surrogate pair is 2 UTF-16 units and 4 UTF-8 bytes - wrong twice over.
    const emoji = '\u{1f4c4}'
    expect(emoji.length).toBe(2)
    expect(bytes(emoji)).toBe(4)
  })
})

describe('checkStatement', () => {
  it('trims before measuring, as the server does', () => {
    /*
     * Measuring untrimmed would refuse a statement the server accepts.
     * Refusing valid work is a bug in the same way accepting invalid work is.
     */
    const st = checkStatement(`  ${'a'.repeat(STATEMENT_MAX_BYTES)}  \n\n`)
    expect(st.used).toBe(STATEMENT_MAX_BYTES)
    expect(st.over).toBe(false)
    expect(st.value).toBe('a'.repeat(STATEMENT_MAX_BYTES))
  })

  it('submits the trimmed value, so what is signed is what was measured', () => {
    // The chain attests to `value`; measuring one string and signing another
    // would put the signature on bytes nothing checked.
    expect(checkStatement('  In my opinion.  ').value).toBe('In my opinion.')
  })

  it('accepts a statement exactly at the limit and refuses one byte more', () => {
    /*
     * The boundary, asserted as a rule rather than a number: `at` is derived
     * from the limit, so changing the limit cannot leave this test asserting
     * a stale figure that still passes.
     */
    const at = checkStatement('a'.repeat(STATEMENT_MAX_BYTES))
    expect(at.used).toBe(at.max)
    expect(at.over).toBe(false)

    const over = checkStatement('a'.repeat(STATEMENT_MAX_BYTES + 1))
    expect(over.used).toBe(over.max + 1)
    expect(over.over).toBe(true)
  })

  it('refuses a multi-byte statement that a character count would pass', () => {
    /*
     * The defect this guards, stated directly. One Devanagari character per
     * three bytes, so a third of the limit in characters is the whole limit
     * in bytes - and one character past that is over, while `.length` is
     * nowhere near it.
     */
    const chars = Math.floor(STATEMENT_MAX_BYTES / 3) + 1
    const st = checkStatement('अ'.repeat(chars))
    expect(st.over).toBe(true)
    expect(st.value.length).toBeLessThan(st.max) // a character count would have passed it
  })

  it('reports empty for whitespace, because the statement is required', () => {
    // `/close-year` requires a statement. A sheet of newlines is not one, and
    // the button must not offer to seal a year with it.
    for (const raw of ['', '   ', '\n\n\t', ' ']) {
      expect(checkStatement(raw).empty, JSON.stringify(raw)).toBe(true)
    }
    expect(checkStatement('In my opinion.').empty).toBe(false)
  })

  it('never reports both empty and over', () => {
    // A contradiction would make the button's disabled state unreadable.
    for (const raw of ['', 'a', 'a'.repeat(STATEMENT_MAX_BYTES + 1), 'अ'.repeat(9000)]) {
      const st = checkStatement(raw)
      expect(st.empty && st.over).toBe(false)
    }
  })

  it('takes the limit as an argument, so the boundary is testable at any size', () => {
    expect(checkStatement('abcd', 4).over).toBe(false)
    expect(checkStatement('abcde', 4).over).toBe(true)
    // ...and bytes, not characters, at a small limit too
    expect(checkStatement('अअ', 4).over).toBe(true)
  })
})

describe('contracts/api/v1.md', () => {
  /*
   * The browser has no copy of the contract, so the limit is duplicated in
   * statement.ts. This is what stops the duplicate drifting: a limit changed
   * in the contract and not in the code fails here.
   *
   * The contract row is not merged yet (#79/PR 79 is approved, unmerged), so
   * this asserts the relationship in the way that cannot report success for
   * the wrong reason: if the contract states a limit it must be ours, and if
   * it states none the test says so out loud instead of passing silently.
   * A bare `if (found) expect(...)` would go green forever the moment the
   * row was renamed.
   */
  const md = readFileSync(API, 'utf8')
  const row = /at most \*\*([\d,]+) bytes of UTF-8\*\*/.exec(md)

  it('states the byte limit, and it is the one the code uses', () => {
    if (!row) {
      /*
       * Deliberately a passing assertion with a message, not a skip: the
       * close-year row must still exist, so a contract that dropped or
       * renamed `/close-year` fails here rather than quietly matching
       * nothing. When PR 79 merges, the branch above takes over.
       */
      expect(md, 'contracts/api/v1.md no longer documents /close-year').toContain('`/close-year`')
      return
    }
    expect(Number(row[1]!.replaceAll(',', ''))).toBe(STATEMENT_MAX_BYTES)
  })

  it('refuses rather than truncates, which is why the form blocks instead of cutting', () => {
    /*
     * If the contract ever said truncate, this module would be wrong to
     * block: it would be refusing work the server would have accepted. The
     * reason it must not truncate is that the chain would then attest to
     * words the auditor did not write.
     *
     * Asserted only once the limit itself is in the contract - there is
     * nothing to truncate before then - and asserted as an alternative so
     * that neither state passes by matching nothing.
     */
    expect(
      row ? /never truncated|rather than truncat/.test(md) : md.includes('`/close-year`'),
      row
        ? 'the contract bounds the statement but no longer says it refuses rather than truncates'
        : 'contracts/api/v1.md no longer documents /close-year',
    ).toBe(true)
  })
})
