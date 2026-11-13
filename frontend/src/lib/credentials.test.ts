/*
 * The sign-in screen's only checks were `type="email" required` and
 * `maxLength={6}` - the browser's opinion, which does not run on a
 * programmatic submit, differs between engines, and is absent entirely once
 * anything other than a human drives the form.
 *
 * These assert the RULE, not sample strings: that the accepted set is the one
 * intended, including the addresses a stricter pattern would wrongly refuse.
 */
import { describe, expect, it } from 'vitest'
import { CODE_LENGTH, checkCode, checkEmail } from './credentials'

describe('checkEmail', () => {
  it('returns the value it checked, normalised, so the two cannot drift', () => {
    const r = checkEmail('  Resident@Example.COM  ')
    expect(r.ok).toBe(true)
    expect(
      r.ok && r.value,
      'the caller must send THIS value; re-deriving it at the call site is how a checked address and a sent address diverge',
    ).toBe('resident@example.com')
  })

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['resident', 'no @ and no domain'],
    ['resident@', 'no domain'],
    ['@example.com', 'no local part'],
    ['resident@example', 'no dot in the domain'],
    ['two parts@example.com', 'an interior space'],
    ['a@b@example.com', 'two @'],
  ])('refuses %j (%s)', (input) => {
    expect(checkEmail(input).ok).toBe(false)
  })

  /*
   * The important half. A rejection here is a resident who cannot sign in and
   * cannot argue with the form, so the check must not be cleverer than it can
   * afford to be. Every one of these is a real, deliverable address that a
   * stricter pattern is known to break.
   */
  it.each([
    ['resident+flat604@example.com', 'plus addressing, used to filter society mail'],
    ["o'brien@example.com", 'an apostrophe in a surname'],
    ['a@b.co', 'very short but valid'],
    ['resident@sub.domain.example.co.in', 'several labels'],
    ['first.last@example.technology', 'a long TLD'],
    ['resident@example.संगठन', 'a non-ASCII TLD'],
  ])('accepts %j (%s)', (input) => {
    expect(
      checkEmail(input).ok,
      'a false rejection locks a real resident out; a false acceptance costs one bounced email',
    ).toBe(true)
  })
})

describe('checkCode', () => {
  it('accepts exactly the stated length, trimmed', () => {
    const r = checkCode(` ${'1'.repeat(CODE_LENGTH)} `)
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toBe('1'.repeat(CODE_LENGTH))
  })

  it('refuses one digit short and one digit long, whatever the length is set to', () => {
    /*
     * Derived from CODE_LENGTH rather than written as 5 and 7. An assertion on
     * a literal gets "fixed" by editing the literal when the constant moves,
     * which deletes the test's meaning while leaving it green.
     */
    expect(checkCode('1'.repeat(CODE_LENGTH - 1)).ok).toBe(false)
    expect(checkCode('1'.repeat(CODE_LENGTH + 1)).ok).toBe(false)
  })

  it('refuses non-digits rather than stripping them', () => {
    /*
     * Stripping would turn an obvious mistype into a plausible-looking code
     * and spend a verification attempt on it anyway.
     *
     * Each of the first three carries EXACTLY CODE_LENGTH digits plus
     * separators, so a mutant that strips non-digits yields a valid-looking
     * code and accepts it. That is the point of the case: an earlier version
     * of this suite asserted only on inputs that collapse to nothing (like
     * 'abcdef'), which left stripping indistinguishable from rejecting - the
     * mutant survived. The loop pins the premise too, so the case cannot
     * quietly stop being about stripping if CODE_LENGTH moves.
     */
    for (const input of ['12 34 56', '12-34-56', '12.34.56']) {
      expect(
        input.replace(/\D/g, '').length,
        'the case only means anything if stripping would produce a valid code',
      ).toBe(CODE_LENGTH)
      expect(checkCode(input).ok, `${input} must be refused, not cleaned`).toBe(false)
    }
    expect(checkCode('abcdef').ok).toBe(false)
    expect(checkCode('१२३४५६').ok, 'Devanagari digits are not what the provider sent').toBe(false)
  })

  it('does not let interior whitespace become the right length', () => {
    /*
     * `trim()` removes the ends, so a pasted code with a trailing newline IS
     * valid; '123 456' is not six digits and must not become them.
     */
    expect(checkCode('123 456').ok).toBe(false)
    expect(checkCode('+123456').ok).toBe(false)
    expect(checkCode('123456\n').ok, 'a trailing newline from a paste is trimmed, so this one is valid').toBe(true)
  })

  it('says how many digits were given, because the field hides the count', () => {
    const r = checkCode('123')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toContain('3')
  })

  it('refuses an empty code without claiming it is the wrong length', () => {
    const r = checkCode('')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/enter the code/i)
  })
})
