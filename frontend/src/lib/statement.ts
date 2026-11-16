/*
 * THE AUDITOR'S STATEMENT IS BOUNDED TWO WAYS, AND NEITHER UNIT IMPLIES THE
 * OTHER.
 *
 * `/close-year` refuses a `statement` over 16,384 bytes of UTF-8, and the
 * deployed function also refuses one over 4,000 CHARACTERS
 * (`cf.text_ok(p_statement, 4000)`, where PostgreSQL `length()` counts
 * characters). Both are measured after trimming and NFC normalization, and
 * both refuse rather than truncate, because a truncated statement would put
 * the chain's signature on words the auditor did not write.
 *
 * The two cross over, so checking one is not checking the other:
 *
 *   4,000 Devanagari characters = 12,000 bytes -> under the byte rule,
 *                                                 refused by the server
 *   16,384 ASCII characters     = 16,384 bytes -> at the byte rule,
 *                                                 refused at 4,001
 *
 * A byte-only check passes text the server rejects in BOTH scripts. So the
 * form applies both and blocks at whichever binds first.
 *
 * Dropping the byte rule in favour of the character one would be the
 * `value.length` bug this module exists to prevent - the same class as a
 * missing x100 on an amount: correct for the ASCII a developer types while
 * testing, wrong for the input the rule exists to bound. Each rule catches
 * input the other passes, so both stay, and an auditor who is told the
 * wrong limit loses the whole statement at the only irreversible action in
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

/*
 * THE DEPLOYED SERVER COUNTS CHARACTERS, AT 4000, AND THAT IS STRICTER.
 *
 * `cf.text_ok(p_statement, 4000)` is `length(btrim(v)) between 1 and max`,
 * and PostgreSQL's `length()` on `text` counts CHARACTERS, not bytes. So
 * the two limits are in different units and neither implies the other:
 *
 *   4000 Devanagari characters  = 12,000 bytes  -> server refuses, bytes pass
 *   16,384 ASCII characters     = 16,384 bytes  -> server refuses at 4001
 *
 * A byte-only check therefore allows text the server rejects, in both
 * scripts, which is the direction that costs the auditor the statement at
 * the one irreversible action in the product. So BOTH ceilings apply and
 * the form blocks at whichever binds first.
 *
 * Keeping the byte ceiling as well is not belt-and-braces: a character
 * count alone is the `.length` bug this module was written to prevent, and
 * if the limit is ever restated in bytes the byte rule is the one that
 * holds. Each catches input the other passes.
 *
 * WHICH ONE IS AUTHORITATIVE, AND WHY BOTH STILL APPLY.
 *
 * The byte limit is the intended one. The contract states it explicitly -
 * 16,384 bytes of UTF-8, measured on the trimmed NFC form - and the backend
 * change that implements it REPLACES the character check with
 * `octet_length(normalize(btrim(p_statement), nfc)) > 16384`. So the end
 * state is bytes only, and this module's byte rule is the one that survives.
 *
 * The character rule is here because it is what the CURRENTLY DEPLOYED
 * function enforces: `cf.text_ok(p_statement, 4000)`, where PostgreSQL
 * `length()` counts characters. Until that change ships, a statement of
 * 4,001 characters is refused by the live server however few bytes it is,
 * and a client that only knows about bytes sends it, gets a refusal it
 * cannot explain, and the auditor loses the text at the one irreversible
 * action in the product.
 *
 * So the rule is: refuse what EITHER limit refuses, which is never wrong in
 * the direction that costs work.
 *
 * WHEN TO DROP THE CHARACTER RULE: ON DEPLOY, NOT ON MERGE.
 *
 * The byte-limit migration is merged (it replaces `cf.text_ok(p_statement,
 * 4000)` with `octet_length(normalize(btrim(p_statement), nfc)) > 16384`),
 * so a tree carrying it reads as "bytes are deployed". That is not the same
 * claim. Production runs an older migration and still enforces 4,000
 * characters, and dropping the rule against a server that still applies it
 * sends the auditor a statement the server refuses - losing the text at the
 * one irreversible action, which is precisely what this module prevents.
 *
 * The asymmetry settles it. Refusing early costs a retype; accepting too
 * much costs the work. So the character ceiling stays until the migration is
 * DEPLOYED, and the suite that reads the migrations says out loud that a
 * checkout is not production, because those two assertions cannot tell the
 * difference on their own.
 */
export const STATEMENT_MAX_CHARS = 4_000

const enc = new TextEncoder()

/** UTF-8 byte length. Not `.length`, which counts UTF-16 code units. */
export const bytes = (s: string) => enc.encode(s).length

/*
 * Characters as PostgreSQL `length()` counts them: code POINTS, not UTF-16
 * code units. `[...s].length` is the code-point count; `s.length` would
 * count an emoji or any astral character twice and refuse a statement the
 * server accepts.
 */
export const chars = (s: string) => [...s].length

/*
 * THE REMAINING ROOM UNDER EACH RULE, AND WHICH ONE BINDS.
 *
 * Deliberately NOT a single scaled "used" number. The form tells the
 * auditor "N bytes left", so a figure that is a byte count under one rule
 * and a rescaled character count under the other would be a false label on
 * the screen where being precise matters most. Each rule reports in its own
 * unit, and the surface names the unit it is showing.
 */
export type Binding = 'bytes' | 'chars'

export type StatementCheck = {
  /** Trimmed and NFC-normalized, exactly as the server stores it. */
  value: string
  /*
   * `used` and `max` are in the unit of the rule that is CLOSER to its
   * ceiling, and `unit` names which. The form must label the figure with
   * `unit` rather than hardcoding "bytes": with a Devanagari statement the
   * binding rule is characters, and calling that a byte count would tell
   * the auditor a wrong number at the one irreversible action.
   */
  used: number
  max: number
  unit: Binding
  /** The server would refuse it, under either rule. */
  over: boolean
  /** Nothing to sign. The server requires a statement; it is not optional. */
  empty: boolean
}

export function checkStatement(
  raw: string,
  max = STATEMENT_MAX_BYTES,
  maxChars = STATEMENT_MAX_CHARS,
): StatementCheck {
  /*
   * TRIM THEN NFC, IN THAT ORDER, because that is literally what the server
   * computes: `normalize(btrim(p_statement), nfc)`. Measuring the raw text
   * measures a different string from the one that gets stored.
   *
   * NFC can GROW text, which is the part that surprises. Composition is not
   * always a contraction: U+0958 क़ is 3 bytes as typed and 6 after NFC,
   * because it is a composition exclusion and normalizes to the two-code-
   * point sequence क + nukta. A statement measured before NFC therefore
   * UNDER-counts, and under-counting is the direction that loses the
   * auditor's work - the client says 16,000 and the server refuses.
   *
   * Normalizing here is correct and does NOT contradict
   * entry-preimage.v1.md's "a verifier MUST NOT normalize". That rule is
   * about VERIFYING a stored entry, where normalizing would let a server
   * serve a different form than it hashed and still pass. This is the INPUT
   * boundary, predicting what the server will store from what was typed.
   * Opposite jobs: the verifier must not touch the bytes, the input form
   * must anticipate them.
   *
   * The submitted value is the normalized one, so what was measured is what
   * is sent. Never truncate to fit - the chain would attest to words the
   * auditor did not write.
   */
  const value = raw.trim().normalize('NFC')
  const b = bytes(value)
  const c = chars(value)
  /*
   * WHICHEVER RULE IS NEARER ITS CEILING is the one reported, so the figure
   * on screen is the one that will actually stop the submission. Ties go to
   * bytes, which keeps ASCII - every existing test and every English
   * statement - reporting in bytes exactly as before.
   */
  const charsBind = c / maxChars > b / max
  return {
    value,
    used: charsBind ? c : b,
    max: charsBind ? maxChars : max,
    unit: charsBind ? 'chars' : 'bytes',
    over: b > max || c > maxChars,
    empty: value.length === 0,
  }
}
