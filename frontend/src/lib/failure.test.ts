/*
 * The Failed card's decision, tested where it is made.
 *
 * The defect: a read whose 200 answer the parser refused showed "The server
 * did not answer." The server had answered; only the shape was wrong. That
 * sentence sends a resident to check a connection that is fine, and tells a
 * treasurer the backend is down when it is up and drifting from the contract.
 *
 * Assertions are on the classification. The copy is `ui.tsx`'s, and a test
 * pinning the sentence would get "fixed" by editing the sentence.
 */
import { describe, it, expect } from 'vitest'
import { failureKind } from './failure'
import { ShapeError, int, parse, object } from './parse'
import { Refused, Unreachable } from './reachable'

describe('failureKind()', () => {
  it('a payload the parser refused is "shape" - the server answered', () => {
    expect(failureKind(new ShapeError('useSummary.balance_minor', 'expected a safe integer, got null'))).toBe('shape')
  })

  it('including one thrown by the real parser, not just a hand-built instance', () => {
    /*
     * A hand-built ShapeError only proves the branch reads the class. This
     * proves the parser's own failure reaches it - if parse() ever wrapped its
     * error in something else, the card would fall back to "unknown" and this
     * case would catch it.
     */
    const thrown = (() => {
      try { parse(object({ balance_minor: int }), { balance_minor: null }, 'useSummary') }
      catch (e) { return e }
      throw new Error('parse accepted a null where the contract says int')
    })()
    expect(failureKind(thrown)).toBe('shape')
  })

  it('a connection failure is "unreachable", whatever the browser called it', () => {
    expect(failureKind(new TypeError('Failed to fetch'))).toBe('unreachable')
    expect(failureKind(new Unreachable('The request did not reach the server.'))).toBe('unreachable')
  })

  it('a refusal is "refused", so the server is quoted', () => {
    expect(failureKind(new Refused('Only the treasurer can post this.'))).toBe('refused')
  })

  it('a bug of ours is "unknown", never blamed on the server or the network', () => {
    expect(failureKind(new Error('cannot read properties of undefined'))).toBe('unknown')
    expect(failureKind(new RangeError('minimumFractionDigits value is out of range'))).toBe('unknown')
  })

  it('a thrown non-Error is "unknown"', () => {
    for (const v of [null, undefined, 'Failed to fetch', 0, {}]) expect(failureKind(v), String(v)).toBe('unknown')
  })

  it('each kind is reachable, so no branch of the card is dead', () => {
    const kinds = new Set([
      new TypeError('x'), new Refused('x'), new ShapeError('p', 'd'), new Error('x'),
    ].map(failureKind))
    expect([...kinds].sort()).toEqual(['refused', 'shape', 'unknown', 'unreachable'])
  })
})
