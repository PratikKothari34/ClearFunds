/*
 * THE AUDITOR'S STATEMENT IS BOUNDED IN BYTES, NOT CHARACTERS.
 *
 * `/close-year` refuses a `statement` over 16,384 bytes of UTF-8 after
 * trimming, and refuses it rather than truncating, because a truncated
 * statement would put the chain's signature on words the auditor did not
 * write.
 *
 * So the form must apply the same rule, and it must apply it in BYTES. A
 * `value.length` check is the same class of bug as a missing x100 on an
 * amount: correct for the ASCII a developer types while testing, wrong for
 * the input the rule exists to bound. A Devanagari character is 3 bytes, so
 * a character counter would pass 16,000 of them - 48,000 bytes - and the
 * auditor would lose the whole statement at the only irreversible action in
 * the product, after clicking "Sign and close the year".
 *
 * That asymmetry is why this is a hard floor rather than a nicety: the cost
 * of being wrong in one direction is a refused submission the auditor can
 * retry, and in the other it is a year that cannot be closed and a
 * statement that has to be rewritten from memory.
 *
 * The limit is duplicated from the contract rather than read from it at
 * runtime - the browser has no copy of contracts/api/v1.md - so the test
 * reads the contract and asserts this number against it. A limit changed
 * there and not here fails the suite.
 */

/** `/close-year`'s ceiling, in bytes of UTF-8. `contracts/api/v1.md`. */
export const STATEMENT_MAX_BYTES = 16_384

const enc = new TextEncoder()

/** UTF-8 byte length. Not `.length`, which counts UTF-16 code units. */
export const bytes = (s: string) => enc.encode(s).length

export type StatementCheck = {
  /** Trimmed, as the server measures it - trailing newlines are not content. */
  value: string
  used: number
  max: number
  /** The server would refuse it. */
  over: boolean
  /** Nothing to sign. The server requires a statement; it is not optional. */
  empty: boolean
}

export function checkStatement(raw: string, max = STATEMENT_MAX_BYTES): StatementCheck {
  /*
   * Trim before measuring, because the server trims before measuring. A
   * client that counted untrimmed bytes would block a statement the server
   * would have accepted - refusing valid work is still a bug.
   */
  const value = raw.trim()
  const used = bytes(value)
  return { value, used, max, over: used > max, empty: value.length === 0 }
}
