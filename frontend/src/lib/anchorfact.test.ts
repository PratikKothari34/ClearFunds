import { describe, expect, it } from 'vitest'
import { anchorFact, anchorRow } from './anchorfact'
import type { Check } from './verify'

/**
 * THE DEFECT THIS MODULE WAS EXTRACTED TO FIX.
 *
 * `Provenance`'s fact line tested `'matches'` and `'unreachable'` and let
 * every remaining anchor state fall to a final `else` reading "Not published
 * outside the committee". `'behind'` and `{ mismatch }` are not absences -
 * they are the published record CONTRADICTING the one on screen - so the two
 * most serious states rendered as the benign one.
 *
 * These tests assert the PROPERTY, not the copy: a failed comparison must
 * never be marked `missing`. Asserting the exact sentences would pin the
 * wording and let the classification drift, which is the bug.
 */

const HEAD: NonNullable<Check['anchorHead']> = {
  hash: 'ff',
  highest_sequence: 40,
  entry_count: 40,
  as_of: Date.UTC(2026, 10, 8),
  format_version: 1,
}

const at = (ms: number) => `on day ${Math.floor(ms / 86_400_000)}`

/** Every state the type declares. If the union grows, this list must too. */
const ALL: Check['anchor'][] = ['unpublished', 'unreachable', 'matches', 'behind', { mismatch: HEAD }]

/** The states where nothing was compared - an absence, not a failure. */
const ABSENT: Check['anchor'][] = ['unpublished', 'unreachable']

describe('anchorFact', () => {
  it('never reports a failed comparison as an absent one', () => {
    for (const a of ALL) {
      const f = anchorFact(a, HEAD, at)
      const absent = ABSENT.includes(a as (typeof ABSENT)[number])
      expect(f.missing, `anchor ${JSON.stringify(a)}`).toBe(absent)
    }
  })

  it('never says "not published" for a state that compared and disagreed', () => {
    /*
     * The literal regression. `behind` and `mismatch` both took the
     * "Not published outside the committee" branch, so the band claimed a
     * difference from a fingerprint it simultaneously said did not exist.
     */
    for (const a of ['behind', { mismatch: HEAD }] as Check['anchor'][]) {
      const { text } = anchorFact(a, HEAD, at)
      expect(text.toLowerCase(), JSON.stringify(a)).not.toContain('not published')
      expect(text.toLowerCase(), JSON.stringify(a)).not.toContain('unreachable')
    }
  })

  it('distinguishes behind from mismatch, because they are different failures', () => {
    // One means entries were withheld; the other that the hash disagrees.
    // Collapsing them loses which thing to go and look at.
    const a = anchorFact('behind', HEAD, at).text
    const b = anchorFact({ mismatch: HEAD }, HEAD, at).text
    expect(a).not.toBe(b)
  })

  it('answers every state the type declares, with a non-empty fact', () => {
    // A missing return would render an empty line, which reads as "fine".
    for (const a of ALL) {
      const f = anchorFact(a, HEAD, at)
      expect(f.text.trim().length, JSON.stringify(a)).toBeGreaterThan(0)
      expect(typeof f.missing, JSON.stringify(a)).toBe('boolean')
    }
  })

  it('still reports a match when the published head is absent', () => {
    /*
     * `anchorHead` is optional on Check. The old code required it to render
     * the match at all - `anchor === 'matches' && check.anchorHead` - so a
     * match with no head fell through to "not published", understating a PASS
     * as an absence. Wrong in the safe direction, still wrong.
     */
    const f = anchorFact('matches', undefined, at)
    expect(f.missing).toBe(false)
    expect(f.text.toLowerCase()).not.toContain('not published')
  })

  it('formats a matched head through the caller\'s formatter', () => {
    // The module must not reach for a date library of its own; the surface
    // owns formatting, so the same instant reads the same everywhere.
    expect(anchorFact('matches', HEAD, at).text).toContain(at(HEAD.as_of))
  })
})

/**
 * `anchorRow` is the same five states said at length, for `/verify`. Its text
 * is deliberately different from the band's; its CLASSIFICATION must not be.
 * These tests assert the agreement, not the wording - pinning the sentences
 * would stop the page being improved and would not catch the bug that
 * happened.
 */
describe('anchorRow', () => {
  const SEQ = 37

  it('agrees with anchorFact about absence versus failure, for every state', () => {
    /*
     * THE AGREEMENT THAT WAS MISSING. Two surfaces rendered these five states
     * independently and one of them mapped the two failures onto the absent
     * line. `ok: null` means nothing was compared; `false` means a comparison
     * failed; they are not interchangeable.
     */
    for (const a of ALL) {
      const fact = anchorFact(a, HEAD, at)
      const row = anchorRow(a, HEAD, SEQ, at)
      if (a === 'matches') {
        expect(row.ok, 'a match is a pass').toBe(true)
        expect(fact.missing).toBe(false)
        continue
      }
      expect(row.ok, `anchor ${JSON.stringify(a)}`).toBe(fact.missing ? null : false)
    }
  })

  it('never reports a failed comparison as nothing-to-compare', () => {
    for (const a of ['behind', { mismatch: HEAD }] as Check['anchor'][]) {
      expect(anchorRow(a, HEAD, SEQ, at).ok, JSON.stringify(a)).toBe(false)
    }
  })

  it('marks the two absences as neither pass nor failure', () => {
    for (const a of ABSENT) {
      expect(anchorRow(a, HEAD, SEQ, at).ok, JSON.stringify(a)).toBeNull()
    }
  })

  it('still reports the discrepancy when behind arrives without a head', () => {
    // The old code asserted anchorHead! here, so a behind with no head threw
    // inside a render - the boundary contains that to one screen and the
    // discrepancy is still lost. Degrade, never vanish.
    const r = anchorRow('behind', undefined, SEQ, at)
    expect(r.ok).toBe(false)
    expect(r.text).toContain(String(SEQ))
  })

  it('reports a match without a head rather than calling it unpublished', () => {
    const r = anchorRow('matches', undefined, SEQ, at)
    expect(r.ok).toBe(true)
    expect(r.text.toLowerCase()).not.toContain('no fingerprint is published')
  })

  it('gives every state a non-empty sentence', () => {
    for (const a of ALL) {
      expect(anchorRow(a, HEAD, SEQ, at).text.trim().length, JSON.stringify(a)).toBeGreaterThan(0)
    }
  })

  it('names the server sequence when more was published than sent', () => {
    // Without the numbers this row tells an auditor there is a problem and
    // nothing about where to look.
    const r = anchorRow('behind', HEAD, SEQ, at)
    expect(r.text).toContain(String(HEAD.highest_sequence))
    expect(r.text).toContain(String(SEQ))
  })
})
