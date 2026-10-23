import { describe, expect, it } from 'vitest'
import { newestEntry } from './ledger'
import { SAMPLE_FLAG_LOG, SAMPLE_LEDGER } from './sample'
import { unresolvedFlagCount } from './counts'

/*
 * The fixture's contract with the UI.
 *
 * This is development data, so a wrong figure here never reaches a
 * resident — but it reaches every screenshot, every manual check and
 * every judgement about whether a screen looks right. Sample data that
 * does not reconcile teaches everyone looking at it to stop checking
 * whether it reconciles, which is the one habit this product exists to
 * encourage.
 *
 * Nothing here asserts a sample NUMBER. Each test states a rule and
 * derives the expected value from the data, so adding an entry cannot
 * turn a test red and cannot be "fixed" by editing an expected figure.
 */

const byId = new Map(SAMPLE_LEDGER.map((e) => [e.id, e]))

describe('SAMPLE_LEDGER identity', () => {
  it('has unique ids and unique sequences', () => {
    expect(new Set(SAMPLE_LEDGER.map((e) => e.id)).size).toBe(
      SAMPLE_LEDGER.length,
    )
    expect(new Set(SAMPLE_LEDGER.map((e) => e.sequence)).size).toBe(
      SAMPLE_LEDGER.length,
    )
  })

  it('all amounts share one currency, so no total mixes two', () => {
    const currencies = new Set(SAMPLE_LEDGER.map((e) => e.amount.currency))
    expect(currencies.size).toBe(1)
  })

  it('amounts are positive integers inside the safe range', () => {
    // Direction carries the sign, never the amount. A negative amount
    // plus an 'out' direction would subtract twice.
    for (const e of SAMPLE_LEDGER) {
      expect(Number.isSafeInteger(e.amount.minor), e.id).toBe(true)
      expect(e.amount.minor, e.id).toBeGreaterThan(0)
    }
  })
})

describe('SAMPLE_LEDGER ordering', () => {
  it('is NOT strictly ordered by sequence, because a reversal sits beside its original', () => {
    /*
     * This asserts the deliberate exception rather than tolerating it.
     *
     * The ledger renders a reversed entry and its reversal as ONE item,
     * so the reversal is positioned next to the entry it cancels, not
     * at the top where its sequence would put it. Array position
     * therefore does not track sequence, and any code that reads
     * `SAMPLE_LEDGER[0]` as "the newest entry" is wrong — that is the
     * bug this test exists to keep fixed, not a shortcoming of the
     * fixture.
     */
    const positions = SAMPLE_LEDGER.map((e) => e.sequence)
    const strictlyDescending = [...positions].sort((a, b) => b - a)
    expect(
      positions,
      'if this ever matches, the fixture lost its out-of-order reversal and the newestEntry guard stops being exercised',
    ).not.toEqual(strictlyDescending)
  })

  it('newestEntry finds the highest sequence wherever it sits in the array', () => {
    const highest = Math.max(...SAMPLE_LEDGER.map((e) => e.sequence))
    expect(newestEntry(SAMPLE_LEDGER)?.sequence).toBe(highest)

    // And it is NOT at position 0, which is what makes the distinction
    // load-bearing rather than theoretical.
    expect(SAMPLE_LEDGER[0]?.sequence).not.toBe(highest)
  })

  it('newestEntry returns undefined for an empty ledger rather than throwing', () => {
    // A society on its first day has no entries, and so does any
    // filtered view that matches nothing.
    expect(newestEntry([])).toBeUndefined()
  })
})

describe('SAMPLE_LEDGER reversals', () => {
  const reversed = SAMPLE_LEDGER.filter((e) => e.state === 'reversed')
  const reversals = SAMPLE_LEDGER.filter((e) => e.state === 'reversal')

  it('contains both halves of a reversal, or the paired rendering is never exercised', () => {
    expect(reversed.length).toBeGreaterThan(0)
    expect(reversals.length).toBeGreaterThan(0)
  })

  it('pairs each reversed entry with one mutual, opposite, equal reversal', () => {
    for (const e of reversed) {
      const r = byId.get(e.reversedBy?.id ?? '')
      expect(r, `${e.id} names a reversal that is in the ledger`).toBeDefined()
      expect(r!.state).toBe('reversal')
      expect(r!.reverses?.id, 'the link points both ways').toBe(e.id)
      expect(r!.amount, 'a partial reversal is not a reversal').toEqual(e.amount)
      expect(r!.direction).not.toBe(e.direction)
      expect(r!.sequence, 'a reversal is posted after what it reverses').toBeGreaterThan(
        e.sequence,
      )
      // The reason is mandatory. An unexplained cancellation is the
      // thing the append-only rule exists to prevent.
      expect(e.reversalReason, `${e.id} states why`).toBeTruthy()
    }
  })

  it('never reverses a reversal, and never reverses one entry twice', () => {
    for (const r of reversals) {
      expect(r.reversedBy, `${r.id} is not itself reversed`).toBeUndefined()
    }
    const targets = reversals.map((r) => r.reverses?.id)
    expect(new Set(targets).size, 'one reversal per original').toBe(
      targets.length,
    )
  })

  it('marks every reversal target as reversed, so neither half renders alone', () => {
    for (const r of reversals) {
      expect(byId.get(r.reverses?.id ?? '')?.state, r.id).toBe('reversed')
    }
  })

  it('nets a reversed pair to zero', () => {
    // The settled rule: balances net reversed pairs to zero BY
    // CONSTRUCTION, not by special-casing them in a total.
    for (const e of reversed) {
      const r = byId.get(e.reversedBy!.id)!
      const signed = (x: typeof e) =>
        x.direction === 'out' ? -x.amount.minor : x.amount.minor
      expect(signed(e) + signed(r), `${e.id} + ${r.id}`).toBe(0)
    }
  })
})

describe('SAMPLE_LEDGER running balance', () => {
  it('moves by exactly the entry amount from each entry to the next in sequence', () => {
    /*
     * Walked in SEQUENCE order, which is the order the balance was
     * computed in — not array order, which pairs the reversal beside
     * its original.
     *
     * The reversal pair is excluded, and this is the one legitimate
     * exception: 848 reverses 845, so between them sit three entries
     * that were posted earlier. Their balances are correct relative to
     * their own neighbours and cannot also be correct relative to a
     * strict walk across the pair.
     *
     * The bug this caught: the filler generator counted sequence
     * DOWNWARDS while accumulating the balance FORWARDS, so every one
     * of its 58 entries disagreed with its neighbour. Nothing threw —
     * the figures simply did not add up on the surface that invites a
     * resident to add them up.
     */
    const inSequence = [...SAMPLE_LEDGER].sort((a, b) => a.sequence - b.sequence)
    const broken: string[] = []

    for (let i = 1; i < inSequence.length; i += 1) {
      const prev = inSequence[i - 1]!
      const curr = inSequence[i]!
      if (curr.state === 'reversal' || prev.state === 'reversed') continue

      const delta =
        curr.direction === 'out' ? -curr.amount.minor : curr.amount.minor
      if (curr.balanceAfter.minor !== prev.balanceAfter.minor + delta) {
        broken.push(curr.id)
      }
    }

    expect(broken).toEqual([])
  })

  it('never reports a balance that is not a safe integer', () => {
    // A float would mean money arithmetic happened somewhere it should
    // not have.
    for (const e of SAMPLE_LEDGER) {
      expect(Number.isSafeInteger(e.balanceAfter.minor), e.id).toBe(true)
    }
  })
})

describe('SAMPLE_FLAG_LOG', () => {
  it('keys only entries that exist, so no question points at nothing', () => {
    for (const entryId of Object.keys(SAMPLE_FLAG_LOG)) {
      expect(byId.has(entryId), entryId).toBe(true)
    }
  })

  it("each entry's openFlagCount equals the unresolved flags in its own log", () => {
    /*
     * The settled rule: only UNRESOLVED flags count in the figure shown
     * to residents, while the log keeps every question ever asked. An
     * entry whose badge disagrees with its own log either hides an open
     * question or claims one that was answered — and in a fixture it
     * makes a wrong badge look correct in every screenshot.
     */
    for (const [entryId, flags] of Object.entries(SAMPLE_FLAG_LOG)) {
      expect(byId.get(entryId)?.openFlagCount, entryId).toBe(
        unresolvedFlagCount(flags),
      )
    }
  })

  it('carries at least one resolved flag beside an unresolved one', () => {
    // Otherwise the distinction between the log and the count is never
    // exercised by anything anyone looks at.
    const all = Object.values(SAMPLE_FLAG_LOG).flat()
    expect(all.filter((f) => f.resolvedAt != null).length).toBeGreaterThan(0)
    expect(all.filter((f) => f.resolvedAt == null).length).toBeGreaterThan(0)
  })

  it('states an author for every question, since the committee must see who asked', () => {
    // Who may READ it is a role check elsewhere; the data has to carry
    // it or the committee cannot answer anyone.
    for (const f of Object.values(SAMPLE_FLAG_LOG).flat()) {
      expect(f.authorHandle, f.id).toBeTruthy()
    }
  })
})
