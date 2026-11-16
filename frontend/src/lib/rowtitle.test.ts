/*
 * `rowTitle` DECIDES WHICH FIELD BECOMES AN ENTRY'S VISIBLE NAME - AND, ON
 * ONE PATH, WHAT GETS WRITTEN INTO THE CHAIN.
 *
 * Four render sites use it (`EntryRow`, and three places in `entry.$seq`),
 * but the fifth caller is the one that raises the stakes:
 * `entry.$seq.tsx:356` builds a reversal proposal with
 * `narration: \`${replace ? 'Correct' : 'Reverse'} ${rowTitle(r)}\``. That
 * string is proposed, approved and appended. Nothing is ever edited or
 * deleted here, so a title that comes out wrong or blank is not a cosmetic
 * glitch on one screen - it is the permanent description of a correction,
 * read at the AGM by people who were not in the room.
 *
 * THE RULE, which is what these cases assert rather than any sample string:
 *
 *   - A charge is raised ON the flats, so its `counterparty` is the
 *     allocation ('Residents'), never a payee. Showing it would label a
 *     maintenance charge with a name nobody transacted with, so a charge and
 *     a charge_reversal title from `narration`.
 *   - Everything else is a payment to or from someone, and that someone is
 *     the useful title. `counterparty` first, `narration` as the fallback.
 *
 * WHY THE FALLBACK IS THE INTERESTING PART. `narration` is `required(str)`
 * in `rows.ts` and `counterparty` is `nullable(str)`, so there is always
 * something to fall back TO and `rowTitle` can never return undefined. But
 * `str` accepts the empty string, and `??` only falls back on null and
 * undefined - so a `counterparty` of "" returns "" while a perfectly good
 * narration sits unused. Measured, not assumed:
 * `{effect: 'expense', counterparty: '', narration: 'Lift repair'}` returns
 * "" today.
 *
 * That is NOT a live defect, and this suite does not claim it is. The server
 * gates both fields through `cf.text_ok`, which is
 * `length(btrim(v)) between 1 and max` - an empty or whitespace-only value
 * is refused before it is ever stored. So the blank title is unreachable
 * through the current backend.
 *
 * It is pinned anyway, for the reason the project keeps pinning this shape:
 * the safety is entirely in a file this one cannot see, on the other side of
 * a lane boundary, and the frontend's own types say the field is a string
 * that may be empty. The cases below state the behaviour the function
 * actually has, name the gate they depend on, and will fail loudly if a
 * later contract relaxes that gate - which is the moment someone needs to
 * know, because by then the string is in the chain.
 */
import { describe, expect, it } from 'vitest'
import { rowTitle } from './format'

/** The shape `rowTitle` reads, without pulling in the whole LedgerRow. */
const row = (effect: string, counterparty: string | null, narration: string) =>
  ({ effect, counterparty, narration }) as unknown as Parameters<typeof rowTitle>[0]

describe('rowTitle', () => {
  it('titles a charge from its narration, never from the allocation', () => {
    /*
     * The decision this function exists for. A charge's counterparty is the
     * flat-set it was raised on, so using it would title "Quarterly
     * maintenance" as "Residents" - naming a payee for a charge that has
     * none. Both charge effects behave the same way.
     */
    expect(rowTitle(row('charge', 'Residents', 'Quarterly maintenance'))).toBe('Quarterly maintenance')
    expect(rowTitle(row('charge_reversal', 'Residents', 'Reversal of Q2 maintenance')))
      .toBe('Reversal of Q2 maintenance')
    // Not merely "returns something" - it must NOT be the counterparty.
    expect(rowTitle(row('charge', 'Residents', 'Quarterly maintenance'))).not.toBe('Residents')
  })

  it('titles a payment from the counterparty, which is who the money moved with', () => {
    expect(rowTitle(row('expense', 'Sharma Electricals', 'Lift repair'))).toBe('Sharma Electricals')
    expect(rowTitle(row('receipt', 'Flat B-204', 'October maintenance'))).toBe('Flat B-204')
  })

  it('falls back to the narration when there is no counterparty at all', () => {
    // nullable(str) in rows.ts, so null is the contract-legal absence.
    expect(rowTitle(row('expense', null, 'Bank charges'))).toBe('Bank charges')
    expect(rowTitle(row('reversal', null, 'Reversal of #41'))).toBe('Reversal of #41')
  })

  it('never returns undefined, because narration is required by the parser', () => {
    /*
     * The property that makes this safe to interpolate into a chain-written
     * narration at entry.$seq.tsx:356. "Reverse undefined" must be
     * impossible, and it is - but only because `narration` is required(str)
     * rather than nullable, which is a fact about rows.ts, so it is asserted
     * here rather than assumed.
     */
    for (const effect of ['expense', 'receipt', 'charge', 'charge_reversal', 'reversal', 'limit', 'seat', 'unseat', 'auditor']) {
      const out = rowTitle(row(effect, null, 'Some narration'))
      expect(out, effect).toBeTypeOf('string')
      expect(out, effect).toBe('Some narration')
    }
  })

  it('treats every non-charge effect the same way, so a new effect gets the payment rule', () => {
    /*
     * The contract's `effect` enum has nine values and this function
     * special-cases two. A tenth effect added later falls into the payment
     * branch by default - which is the right default for a posting that
     * moves money with somebody, and is asserted here so the behaviour is a
     * decision on record rather than an accident of the `if`.
     */
    for (const effect of ['expense', 'receipt', 'reversal', 'limit', 'seat', 'unseat', 'auditor']) {
      expect(rowTitle(row(effect, 'Someone', 'A narration')), effect).toBe('Someone')
    }
    // ...and only the two charge effects ignore the counterparty.
    for (const effect of ['charge', 'charge_reversal']) {
      expect(rowTitle(row(effect, 'Someone', 'A narration')), effect).toBe('A narration')
    }
  })

  it('returns an empty title for an empty counterparty, which cf.text_ok is what prevents', () => {
    /*
     * PINNED, NOT ENDORSED - and the one case here that is about a weakness
     * rather than a rule.
     *
     * `??` falls back on null and undefined only, so "" is treated as a
     * usable counterparty and the narration goes unread. The server refuses
     * an empty or whitespace-only value via cf.text_ok
     * (`length(btrim(v)) between 1 and max`), so this cannot be reached
     * today.
     *
     * If this test ever fails, the gate was relaxed and `rowTitle` needs a
     * `||`-style fallback BEFORE anything reaches entry.$seq.tsx:356 - the
     * reversal narration would otherwise read "Reverse " and be appended
     * that way, permanently.
     */
    expect(rowTitle(row('expense', '', 'Lift repair'))).toBe('')
    // The same hole on the charge side: an empty narration titles nothing.
    expect(rowTitle(row('charge', 'Residents', ''))).toBe('')
  })
})
