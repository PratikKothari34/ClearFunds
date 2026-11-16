import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { adoptExponent, exponent, setExponent, format } from './money'

/**
 * The exponent is the one number in the money path that is silently wrong
 * rather than loudly wrong when it disagrees with reality.
 *
 * `format()` never divides - it splits a digit string - so the exponent
 * decides where the decimal point goes and nothing else checks it. A figure
 * formatted with the wrong exponent is off by a power of ten and still looks
 * like money, which is the same failure mode as the missing x100 at the input
 * boundary: a plausible amount nobody will look at twice.
 *
 * These assert the RULE (which source wins, and that nothing is assumed), not
 * a list of currencies. Asserting `exponent('XYZ') === 2` would be a test of
 * the table; asserting that an unresolvable currency THROWS is a test of the
 * decision.
 */
describe('the minor-unit exponent', () => {
  it('follows ISO 4217 where Intl disagrees with it', () => {
    /*
     * IQD is the case that proves the rule, and it is not hypothetical: this
     * runtime's Intl reports 0 minor-unit digits for the Iraqi dinar, while
     * ISO 4217 says 3. Taking Intl's answer renders 1500 minor units - 1.500
     * IQD - as "1,500", a thousandfold overstatement that reads as a healthy
     * balance.
     *
     * The assertion is deliberately written as a DISAGREEMENT rather than as
     * `toBe(3)`: it fails if someone "simplifies" the table away, and it
     * documents why the table cannot be deleted even when Intl looks
     * authoritative.
     */
    const intlSays = new Intl.NumberFormat('en', { style: 'currency', currency: 'IQD' })
      .resolvedOptions().maximumFractionDigits
    expect(exponent('IQD')).toBe(3)
    expect(exponent('IQD'), 'ISO must win over Intl for IQD').not.toBe(intlSays)
  })

  it('places the decimal point by the exponent, so a 3-digit currency is not read as 2', () => {
    // The consequence, not the lookup: the same integer formatted under the
    // two answers differs by a factor of ten, and this is the surface a
    // resident reads.
    expect(format(1500, 'IQD')).toContain('1.500')
    expect(format(1500, 'INR')).toContain('15.00')
    expect(format(1500, 'JPY')).toContain('1,500')
  })

  it('prefers an exponent the server stated over its own table', () => {
    /*
     * The server owns an ISO table and is authoritative; this module holding a
     * second copy is a convenience, not a source of truth. Two derivations of
     * one number agree on the common cases and diverge where nobody looks, so
     * when the server states one it wins - including when it contradicts the
     * table here, because the alternative is a client quietly overruling the
     * server about its own society's currency.
     */
    /*
     * The code must be one the TABLE also answers, or this proves nothing:
     * with an unknown code both orderings agree and the precedence is never
     * exercised. Found by mutation - reversing the two sources left an
     * earlier version of this test green.
     *
     * JPY is in the table as 0. A server stating 2 must win, even though that
     * contradicts what this module believes about the yen.
     */
    expect(exponent('JPY')).toBe(0)
    setExponent('JPY', 2)
    expect(exponent('JPY'), "the server's figure must overrule the table").toBe(2)
    // Put it back, so later cases in this file see the real value.
    setExponent('JPY', 0)
  })

  it('refuses an impossible exponent rather than storing it', () => {
    // A negative or fractional exponent would corrupt every figure in the
    // society. ISO exponents are 0-4; anything else is a bad payload or a bug,
    // and storing it silently is how one bad field becomes every wrong amount.
    for (const bad of [-1, 1.5, 5, NaN]) {
      expect(() => setExponent('ZZB', bad), `exponent ${bad} must be refused`).toThrow()
    }
  })

  it('never silently assumes two decimals for a currency it cannot resolve', () => {
    /*
     * This is the guard that replaced `?? 2`. A currency nothing can resolve
     * must not become a two-decimal currency by default: that turns an unknown
     * into a confident wrong answer, and for a 0-digit or 3-digit currency
     * every figure on every screen is then off by a factor of 100 or 10.
     *
     * Throwing is the right failure here. The render boundary contains it to
     * one screen and the figure is reported as unreadable - which is the
     * disclosure the product owes - rather than shown wrong.
     *
     * Note what this does NOT assert: that some specific string throws. Intl
     * resolves many odd codes to 2, so the test drives a code that cannot be
     * resolved at all, and asserts the behaviour on it.
     */
    // ZZT is well-formed, so Intl would answer 2 with full confidence. The
    // point is that this module answers nothing at all.
    expect(() => exponent('ZZQ')).toThrow(/exponent/i)
    expect(() => exponent('XXX')).toThrow(/exponent/i)
  })

  it('remembers a stated exponent for the rest of the session', () => {
    /*
     * The cache is module-level and deliberately persistent: api_me states the
     * society currency once at sign-in, and every figure afterwards formats
     * from it without re-asking. Found while writing these tests - a code
     * registered in an earlier case was still known in a later one, which is
     * the behaviour, not a leak.
     *
     * It is worth pinning because the alternative design - re-deriving per
     * format call - is what reintroduces a second source of truth.
     */
    setExponent('ZZP', 0)
    expect(exponent('ZZP')).toBe(0)
    expect(exponent('ZZP')).toBe(0)
    // And a later statement wins, so a society that corrects its currency
    // does not keep formatting from the stale figure.
    setExponent('ZZP', 3)
    expect(exponent('ZZP')).toBe(3)
  })

  it('agrees with Intl on the currencies where ISO and Intl agree', () => {
    // The table must not drift away from the common cases while claiming to
    // be ISO. Where the two sources agree, this module must give that answer -
    // so a typo in the table (INR: 3) fails here rather than in production.
    for (const c of ['INR', 'JPY', 'KWD', 'BHD', 'ISK']) {
      const intlSays = new Intl.NumberFormat('en', { style: 'currency', currency: c })
        .resolvedOptions().maximumFractionDigits
      expect(exponent(c), `${c} must match Intl where ISO agrees with it`).toBe(intlSays)
    }
  })
})

/*
 * Adopting what the server stated.
 *
 * `adoptExponent` is the deciding function: it answers "do we take the
 * server's figure, and what happens when it did not send one". The hook that
 * calls it only reports the decision, so these cases drive this and the
 * wiring is asserted separately below.
 */
describe('adopting the exponent the server stated', () => {
  it('takes the server figure over the local table', () => {
    /*
     * The assertion is a DISAGREEMENT, deliberately. If the server's table and
     * ours happened to agree on the currency under test, a passing assertion
     * would prove nothing about which source won - the usual trap where every
     * wrong answer is also the right one. So this uses a currency our table
     * knows and states a different exponent for it, which only the server's
     * figure can produce.
     */
    expect(exponent('JPY')).toBe(0)
    adoptExponent({ currency: 'JPY', currency_exponent: 3 })
    expect(exponent('JPY'), "the server's figure must win over the local table").toBe(3)
  })

  it('leaves the table in charge when the server sent no exponent, and never defaults', () => {
    /*
     * The case that exists because production runs a deployment older than the
     * migration that added the field. Two halves, and the second is the one
     * that matters:
     *
     *   - a currency the table knows still formats, so an older deployment is
     *     not a broken screen;
     *   - a currency NEITHER source knows still THROWS. A fallback of 2 here
     *     would be the silent wrong answer this whole module exists to refuse,
     *     and it is exactly the shape a well-meaning `?? 2` would take.
     */
    expect(adoptExponent({ currency: 'INR', currency_exponent: null })).toBe(false)
    expect(exponent('INR')).toBe(2)
    expect(
      () => exponent('ZZN'),
      'an absent server exponent must not become a default for an unknown currency',
    ).toThrow(/exponent/i)
  })

  it('refuses an out-of-range figure rather than formatting with it', () => {
    // A server that reported a nonsense exponent must not silently move every
    // decimal point. setExponent already refuses; this pins that adoption does
    // not route around it.
    expect(() => adoptExponent({ currency: 'ZZM', currency_exponent: 9 })).toThrow()
    expect(() => adoptExponent({ currency: 'ZZM', currency_exponent: -1 })).toThrow()
  })

  it('is actually wired into the read that carries the society', () => {
    /*
     * The decision above is worthless unwired: deleting the call from useMe
     * leaves every case in this describe green, because they call
     * adoptExponent directly. That is the same trap as a presenter test - it
     * speaks for the function, never for whether anything invokes it.
     *
     * Read from source rather than mounted, because the thing being asserted
     * is the wiring itself. Comments are stripped first: this file's own prose
     * names the identifier, and a check that a NAME appears somewhere in a
     * file is satisfied by a sentence about it.
     */
    const src = readFileSync(resolve(__dirname, 'session.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(src, 'session.tsx must import the adoption decision').toMatch(
      /import\s*\{[^}]*\badoptExponent\b[^}]*\}\s*from\s*'\.\/money'/,
    )
    expect(src, 'api_me must adopt the exponent it reports, not just parse it').toMatch(
      /adoptExponent\s*\(/,
    )
  })
})
