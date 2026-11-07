import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STATEMENT_MAX_BYTES, STATEMENT_MAX_CHARS, bytes, chars, checkStatement } from './statement'

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
     *
     * Sized to the CHARACTER ceiling, because that is the rule that binds
     * for ASCII: 16,384 ASCII characters is at the byte limit but well past
     * `cf.text_ok`'s 4,000 characters, so a statement built to the byte
     * limit is refused by the deployed server.
     */
    const body = 'a'.repeat(STATEMENT_MAX_CHARS)
    const st = checkStatement(`  ${body}  \n\n`)
    expect(st.used).toBe(STATEMENT_MAX_CHARS)
    expect(st.over).toBe(false)
    expect(st.value).toBe(body)
  })

  /*
   * NFC IS APPLIED, AND NFC CAN GROW TEXT. The server computes
   * `normalize(btrim(s), nfc)`, so measuring the raw text measures a
   * different string from the one stored.
   *
   * U+0958 क़ is the case that makes this matter: it is a composition
   * EXCLUSION, so NFC expands it to क + U+093C nukta - one code point
   * becomes two, three bytes become six. Measuring before NFC therefore
   * UNDER-counts, which is the direction that loses the auditor's work.
   */
  it('normalizes to NFC before measuring, because the server stores the NFC form', () => {
    const raw = 'क़'
    expect(raw.length, 'the fixture must be the un-normalized form').toBe(1)
    const st = checkStatement(raw)
    expect(st.value, 'the measured value must be the NFC form').toBe('क़')
    expect(st.value.length).toBe(2)
    expect(bytes(st.value), 'NFC grew this character from 3 bytes to 6').toBe(6)
  })

  it('submits the NFC form, so what is signed is what was measured', () => {
    const st = checkStatement('  क़  ')
    expect(st.value).toBe('क़')
    expect(st.used).toBe(chars(st.value))
  })

  it('submits the trimmed value, so what is signed is what was measured', () => {
    // The chain attests to `value`; measuring one string and signing another
    // would put the signature on bytes nothing checked.
    expect(checkStatement('  In my opinion.  ').value).toBe('In my opinion.')
  })

  /*
   * EACH BOUNDARY IS ASSERTED AGAINST ITS OWN RULE, with the other ceiling
   * raised out of the way, so a pass cannot come from the wrong rule
   * catching the text. Both are derived from the limits rather than written
   * as numbers, so changing a limit cannot leave a stale figure passing.
   */
  it('accepts a statement exactly at the byte limit and refuses one byte more', () => {
    const huge = Number.MAX_SAFE_INTEGER // keep the character rule out of it
    const at = checkStatement('a'.repeat(STATEMENT_MAX_BYTES), STATEMENT_MAX_BYTES, huge)
    expect(at.used).toBe(at.max)
    expect(at.unit).toBe('bytes')
    expect(at.over).toBe(false)

    const over = checkStatement('a'.repeat(STATEMENT_MAX_BYTES + 1), STATEMENT_MAX_BYTES, huge)
    expect(over.used).toBe(over.max + 1)
    expect(over.over).toBe(true)
  })

  it('accepts a statement exactly at the character limit and refuses one more', () => {
    const at = checkStatement('अ'.repeat(STATEMENT_MAX_CHARS))
    expect(at.used).toBe(STATEMENT_MAX_CHARS)
    expect(at.unit).toBe('chars')
    expect(at.over).toBe(false)

    const over = checkStatement('अ'.repeat(STATEMENT_MAX_CHARS + 1))
    expect(over.over).toBe(true)
  })

  /*
   * THE TWO RULES CROSS OVER, so each must catch what the other passes.
   * This is the whole reason both are applied, and either assertion alone
   * would leave half the input space accepted by us and refused by the
   * server - at the one irreversible action in the product.
   */
  it('refuses a multi-byte statement that a character count would pass', () => {
    // Under the byte rule only: a third of the byte limit in characters is
    // the whole limit in bytes, while `.length` is nowhere near it.
    const n = Math.floor(STATEMENT_MAX_BYTES / 3) + 1
    const st = checkStatement('अ'.repeat(n), STATEMENT_MAX_BYTES, Number.MAX_SAFE_INTEGER)
    expect(st.over).toBe(true)
    expect(chars(st.value)).toBeLessThan(STATEMENT_MAX_BYTES)
  })

  it('refuses an ASCII statement that a byte count alone would pass', () => {
    /*
     * The converse, and the one that was actually shipping: 16,384 ASCII
     * characters is exactly at the byte ceiling and more than four times
     * the deployed server's 4,000-character ceiling. A byte-only check
     * called this fine and the server refused it.
     */
    const st = checkStatement('a'.repeat(STATEMENT_MAX_BYTES))
    expect(bytes(st.value), 'within the byte rule').toBeLessThanOrEqual(STATEMENT_MAX_BYTES)
    expect(st.over, 'but over the character rule, so refused').toBe(true)
    expect(st.unit).toBe('chars')
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

/*
 * THE CHARACTER RULE IS PINNED TO THE DEPLOYED FUNCTION, AND IS MEANT TO BE
 * TEMPORARY.
 *
 * The contract's limit is bytes (16,384 of UTF-8), and the backend change
 * that implements it replaces the character check with octet_length. So this
 * suite's job is to notice the moment that lands, because the character
 * ceiling is then obsolete and keeping it would refuse statements the server
 * accepts - a false denial, which is the worse direction.
 *
 * Asserted as a two-state rule rather than a single expectation, so neither
 * state passes by matching nothing: the deployed function either still
 * counts characters at STATEMENT_MAX_CHARS, or it counts bytes, and if it
 * counts bytes this says to drop the character rule.
 */
describe('the limit the deployed server actually enforces', () => {
  const RULES = resolve(__dirname, '../../../backend/supabase/migrations/20261026000003_rules.sql')
  const sql = readFileSync(RULES, 'utf8')
  const charCheck = /cf\.text_ok\(p_statement,\s*(\d+)\)/.exec(sql)
  const byteCheck = /octet_length\(normalize\(btrim\(p_statement\),\s*nfc\)\)/.test(sql)

  it('bounds the auditor statement at all, in one unit or the other', () => {
    // Neither present means close-year stopped bounding the statement, which
    // is a backend regression this side should not hide.
    expect(
      Boolean(charCheck) || byteCheck,
      'close-year no longer bounds p_statement in either characters or bytes',
    ).toBe(true)
  })

  it('agrees with whichever unit is deployed', () => {
    if (byteCheck) {
      /*
       * The byte check has landed. The character ceiling is now obsolete:
       * the server accepts 16,384 bytes whatever the character count, so
       * our 4,000-character rule would refuse valid work. Raise
       * STATEMENT_MAX_CHARS out of the way (or delete the rule and this
       * block) in the same change that notices this.
       */
      expect(
        STATEMENT_MAX_CHARS,
        'the server now bounds bytes, not characters: the 4,000-character rule is a false denial and must be lifted',
      ).toBeGreaterThan(STATEMENT_MAX_BYTES)
      return
    }
    expect(Number(charCheck![1]), 'the deployed character ceiling moved and statement.ts was not updated')
      .toBe(STATEMENT_MAX_CHARS)
  })

  it('confirms cf.text_ok measures characters, which is why the unit matters', () => {
    /*
     * `length()` on `text` counts characters in PostgreSQL; `octet_length()`
     * counts bytes. The two limits in this module are in different units
     * only because of this one function, so it is asserted directly.
     */
    const fn = /create function cf\.text_ok[\s\S]*?\$\$;/.exec(sql)
    expect(fn, 'cf.text_ok is gone').not.toBeNull()
    expect(fn![0], 'cf.text_ok no longer measures characters with length()').toContain('length(btrim(v))')
    expect(fn![0], 'cf.text_ok now measures bytes').not.toContain('octet_length')
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
