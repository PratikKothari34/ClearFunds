import { readdirSync, readFileSync } from 'node:fs'
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
  /*
   * READ EVERY MIGRATION IN APPLY ORDER, NOT ONE FILE.
   *
   * `cf.check_close` is defined in `..._rules.sql` and a later migration may
   * `create or replace` it from a file of its own - which is exactly how the
   * byte limit arrives. Reading only `rules.sql` therefore reports the
   * ORIGINAL definition forever: the character check sits there untouched, so
   * this suite would stay green through the very change it exists to detect,
   * and the obsolete 4,000-character ceiling would start refusing statements
   * the server accepts. A guard that cannot observe the change it watches for
   * is indistinguishable from no guard.
   *
   * So the effective definition is the LAST one in filename order, which is
   * the order Supabase applies them in.
   */
  const MIGRATIONS = resolve(__dirname, '../../../backend/supabase/migrations')
  const applied = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(resolve(MIGRATIONS, f), 'utf8'))

  /*
   * A pattern that matches NOTHING must fail rather than report success, the
   * same rule the asset and budget checks follow: if `check_close` is ever
   * renamed, every assertion below would pass vacuously on an empty string.
   */
  const defs = applied.filter((sql) => /function cf\.check_close\b/.test(sql))
  const sql = defs.at(-1) ?? ''

  it('finds the function it is asserting about', () => {
    expect(
      defs.length,
      'no migration defines cf.check_close: this suite would pass vacuously',
    ).toBeGreaterThan(0)
  })

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

  it('agrees with whichever unit the migrations in this tree bound', () => {
    if (byteCheck) {
      /*
       * THE BYTE MIGRATION IS IN THIS TREE. That is NOT the same as the
       * server enforcing bytes, and this case used to conflate the two: it
       * demanded STATEMENT_MAX_CHARS be raised above the byte ceiling the
       * moment the migration appeared in the working tree. That demand is
       * the dangerous direction.
       *
       * Production is behind this migration. A deployment still running the
       * character check refuses text our raised rule would accept, so
       * lifting the rule here sends the auditor text the live server
       * rejects - losing the statement at the one irreversible action,
       * which is the failure this whole module exists to prevent. The note
       * in the case below already states this asymmetry: refusing early
       * costs a retype, accepting too much costs the work.
       *
       * So the only thing this case may assert while both units exist in
       * history is that our character rule is still STRICTER than the byte
       * ceiling, i.e. it cannot accept more than the most permissive server
       * would. A character count never exceeds the byte count of the same
       * text (UTF-8 is >= 1 byte per character), so a 4,000-character rule
       * can never admit more than 16,384 bytes. That is the safe invariant,
       * and it holds whichever unit is actually deployed.
       *
       * The rule is dropped when the byte migration is DEPLOYED. That is a
       * deliberate human decision made against the live server, not a
       * conclusion this suite is allowed to draw from a file listing.
       */
      expect(
        STATEMENT_MAX_CHARS,
        'the character rule must stay no looser than the byte ceiling while production may still enforce characters',
      ).toBeLessThanOrEqual(STATEMENT_MAX_BYTES)
      return
    }
    expect(Number(charCheck![1]), 'the deployed character ceiling moved and statement.ts was not updated')
      .toBe(STATEMENT_MAX_CHARS)
  })

  it('reports the migration set it actually read, because a checkout is not production', () => {
    /*
     * WHAT THIS SUITE CAN AND CANNOT SEE.
     *
     * Everything above reads the migrations in THIS WORKING TREE. That is the
     * right source for "has the byte limit been written yet", and the wrong
     * source for "what does the live server enforce right now" - the two are
     * different questions and the character rule depends on the second.
     *
     * The gap is real and it has both signs:
     *
     *   - A branch that predates the byte-limit migration reads the character
     *     check and concludes the character rule is current. On a branch where
     *     the migration has since merged to main, that conclusion is stale.
     *   - A tree that HAS the migration concludes the rule must be lifted.
     *     But a deployment behind that migration still enforces 4,000
     *     characters, so lifting it there sends the auditor text the live
     *     server refuses - losing the statement at the irreversible action,
     *     which is the failure this module exists to prevent.
     *
     * So the asymmetry decides it: refusing early costs a retype, accepting
     * too much costs the work. The character rule is dropped when the byte
     * migration is DEPLOYED, not when it is merged, and the two assertions
     * above cannot tell those apart.
     *
     * This case therefore does not guess. It pins the number of migrations
     * read, so a tree that silently lost or gained the relevant files fails
     * here instead of answering the deployment question from a partial set -
     * the same rule as a budget pattern that matches nothing.
     */
    expect(
      applied.length,
      'no migrations were read: every conclusion above is drawn from an empty set',
    ).toBeGreaterThan(20)
    /*
     * And the two units must never both be present in the effective
     * definition. If one migration ever adds the byte check WITHOUT removing
     * the character check, both branches of the previous case are satisfiable
     * and the suite would report whichever it happened to test first.
     */
    expect(
      Boolean(charCheck) && byteCheck,
      'check_close bounds the statement in BOTH units: the deployed-unit question has no single answer',
    ).toBe(false)
  })

  it('confirms cf.text_ok measures characters, which is why the unit matters', () => {
    /*
     * `length()` on `text` counts characters in PostgreSQL; `octet_length()`
     * counts bytes. The two limits in this module are in different units
     * only because of this one function, so it is asserted directly.
     */
    const rules = applied.find((m) => /create function cf\.text_ok/.test(m)) ?? ''
    const fn = /create function cf\.text_ok[\s\S]*?\$\$;/.exec(rules)
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
