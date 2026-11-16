import { describe, expect, it } from 'vitest'
import { Refused as RefusedFromSource } from './reachable'
import { Refused, bytea, unwrap } from './supabase'

/*
 * `unwrap` and `bytea` had no test at all.
 *
 * `unwrap` is the only place that decides whether the server said NO FOR A
 * REASON or something broke. Ten surfaces branch on `e instanceof Refused` to
 * choose between showing the server's own sentence and showing "Try again",
 * and `main.tsx` uses the same test to decide whether to RETRY - so a
 * misclassified refusal is re-sent twice against a rule that already declined
 * it, and a misclassified fault replaces a real explanation with a shrug.
 *
 * `bytea` strips the `\x` that Postgres puts in front of a bytea value, before
 * the hex is compared with the contract's. Miss the strip and every link
 * mismatches: the app reports the chain as tampered when nothing is wrong,
 * which is a false accusation at the product's central claim. Strip too
 * eagerly and a real mismatch could be hidden.
 */

describe('unwrap(): a rule the person should read, or a fault', () => {
  const ok = { data: { seq: 7 }, error: null }

  it('returns the row when there is no error', () => {
    expect(unwrap(ok)).toEqual({ seq: 7 })
  })

  it("turns P0001 into Refused, carrying the server's own sentence", () => {
    /*
     * P0001 is what a Postgres RAISE gives a broken rule, and the message is
     * written for the person reading it. Losing either the class or the text
     * replaces an explanation ("a treasurer cannot approve alone") with
     * "Try again", which tells the approver nothing and invites a retry.
     */
    const message = 'Two admins must approve an entry at this amount.'
    let thrown: unknown
    try {
      unwrap({ data: null, error: { code: 'P0001', message } })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(Refused)
    expect((thrown as Error).message).toBe(message)
  })

  it('leaves every other code a plain Error, never Refused', () => {
    /*
     * The rule, not a sample: only P0001 is the server speaking to the person.
     * A connection fault, a constraint violation and a permission error are
     * ours to report as a fault - dressing one as Refused would print
     * Postgres internals to a resident as though a committee rule had spoken.
     */
    for (const code of ['23505', '42501', '08006', 'PGRST301', '', undefined]) {
      let thrown: unknown
      try {
        unwrap({ data: null, error: { ...(code === undefined ? {} : { code }), message: 'duplicate key' } })
      } catch (e) {
        thrown = e
      }
      expect(thrown, `code=${String(code)}`).toBeInstanceOf(Error)
      expect(thrown, `code=${String(code)}`).not.toBeInstanceOf(Refused)
      expect((thrown as Error).message, `code=${String(code)}`).toBe('duplicate key')
    }
  })

  it('throws on an error even when `data` came back as well', () => {
    // An error is the answer whatever else is in the envelope. Returning the
    // data because it is present would act on a row the server declined.
    expect(() => unwrap({ data: { seq: 7 }, error: { code: 'P0001', message: 'no' } })).toThrow(Refused)
  })

  it('returns falsy data rather than treating it as an error', () => {
    /*
     * `0`, `''` and `false` are answers. A truthiness test on `data` here
     * would be the `zero-is-not-absent` bug: a legitimate zero becomes a
     * thrown fault.
     */
    expect(unwrap({ data: 0, error: null })).toBe(0)
    expect(unwrap({ data: '', error: null })).toBe('')
    expect(unwrap({ data: false, error: null })).toBe(false)
  })

  it('is the same Refused class the screens test against', () => {
    /*
     * `supabase.ts` re-exports Refused from `reachable.ts` so that
     * `components/ui.tsx` can import the class without pulling the Supabase
     * SDK into the shared chunk. Two declarations of a same-named error would
     * make every `instanceof Refused` on ten surfaces answer false, silently,
     * with nothing failing to typecheck.
     */
    expect(Refused).toBe(RefusedFromSource)
  })
})

describe('bytea(): the prefix Postgres adds and the contract does not have', () => {
  const HEX = 'a3f10b9c'

  it('strips a leading \\x', () => {
    expect(bytea('\\x' + HEX)).toBe(HEX)
  })

  it('leaves bare hex untouched', () => {
    // The same value must survive either representation: whether the prefix
    // was added is the server's business, and a hash that round-trips
    // differently is reported as a broken link.
    expect(bytea(HEX)).toBe(HEX)
    expect(bytea(bytea('\\x' + HEX))).toBe(HEX)
  })

  it('strips only at the start, and only once', () => {
    /*
     * A global replace would delete an `\x` occurring inside the value. Hex
     * cannot contain one today, but the function takes a string and its
     * callers hand it whatever the column held.
     */
    expect(bytea('\\x' + HEX + '\\x' + HEX)).toBe(HEX + '\\x' + HEX)
  })

  it('does not strip a bare backslash or a bare x', () => {
    expect(bytea('x' + HEX)).toBe('x' + HEX)
    expect(bytea('\\' + HEX)).toBe('\\' + HEX)
  })

  it('tests the START of the value, not whether it contains the prefix', () => {
    /*
     * An `includes('\x')` test looks equivalent and survives every case that
     * puts the prefix first - including a doubled prefix, which still starts
     * with one. The difference only shows on a value that CONTAINS the prefix
     * without leading with it: `includes` then slices two characters off the
     * front, corrupting the hash into a mismatch that reads as tamper
     * evidence. This is the mechanism assertion the other cases cannot make.
     */
    expect(bytea(HEX + '\\x' + HEX)).toBe(HEX + '\\x' + HEX)
    expect(bytea('ff\\x')).toBe('ff\\x')
  })

  it('handles the empty string without inventing content', () => {
    expect(bytea('')).toBe('')
    expect(bytea('\\x')).toBe('')
  })

  it('never shortens a value it did not find the prefix on', () => {
    /*
     * The outcome that matters, stated as the rule: an unprefixed value must
     * come back whole. Any slice applied unconditionally - `slice(2)` without
     * the test - would eat the first two hex digits, and a truncated hash
     * mismatches and reads as tamper evidence.
     */
    for (const s of [HEX, 'ff', 'f', '0x' + HEX, 'X' + HEX]) {
      expect(bytea(s), s).toBe(s)
    }
  })
})
