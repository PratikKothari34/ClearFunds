import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cancelledEffect, cancelledNoun } from './cancelledCopy'

describe('a cancelled entry is named by its direction', () => {
  it('calls money in a receipt and money out a payment', () => {
    // The detail page called every cancelled entry a payment, so a
    // cancelled receipt told a resident the society had cancelled
    // something it paid out - the opposite event.
    expect(cancelledNoun('in')).toBe('receipt')
    expect(cancelledNoun('out')).toBe('payment')
  })

  it('never uses accounting words a resident has not met', () => {
    for (const d of ['in', 'out'] as const) {
      expect(cancelledNoun(d)).not.toMatch(/credit|debit|voucher|entry/i)
    }
  })

  it('states the balance effect in the right direction', () => {
    /*
     * ASSERTS THE DISTINCTION, NOT THE SENTENCE. For money out the
     * society paid and then cancelled, so it no longer counts
     * against the balance. For money in the society is recording
     * that the amount is not treated as received - "does not count
     * towards the balance" reads as though the money is sitting
     * somewhere uncounted.
     */
    expect(cancelledEffect('in')).not.toBe(cancelledEffect('out'))
    expect(cancelledEffect('in')).toMatch(/not counted as received|not received/i)
    expect(cancelledEffect('out')).toMatch(/does not count/i)
    for (const d of ['in', 'out'] as const) {
      expect(cancelledEffect(d)).toMatch(/balance/i)
    }
  })

  it('is what the pages use, instead of a hardcoded noun', () => {
    /*
     * Reads the real sources. A page that retypes "This payment was
     * cancelled" is the exact bug this module exists to remove, and
     * nothing else would catch its return.
     */
    const offenders: string[] = []
    for (const dir of ['src/routes', 'src/components']) {
      for (const f of readdirSync(resolve(dir)).filter(
        (n) => n.endsWith('.tsx') && !n.includes('.test.'),
      )) {
        const code = readFileSync(resolve(dir, f), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
          .replace(/\/\/[^\n]*/g, '')
        if (/This payment was cancelled|This receipt was cancelled/.test(code)) {
          offenders.push(f)
        }
      }
    }
    expect(
      offenders,
      `these files hardcode a cancelled-entry noun instead of calling cancelledNoun(): ${offenders.join(', ')}`,
    ).toEqual([])
  })
})

describe('a failure message a screen reader actually hears', () => {
  it('announces on insertion rather than through a freshly mounted live region', () => {
    /*
     * A live region announces CHANGES inside a region the screen
     * reader was already watching. `BandFallback` mounts the region
     * and its text in the same commit, so `aria-live="polite"` there
     * announced nothing - on every band failure, since it was
     * written. A live region that never fires looks identical in the
     * DOM to one that works, which is why this is asserted on the
     * source rather than left to review.
     *
     * `role="alert"` is announced when the node is inserted.
     */
    const code = readFileSync(
      resolve('src/components/BandFallback.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    expect(code).toMatch(/role="alert"/)
    expect(
      code,
      'a polite live region mounted together with its text never announces',
    ).not.toMatch(/aria-live/)
  })

  it('leaves the regions that do update their own text alone', () => {
    /*
     * Control, so the rule above cannot be "ban aria-live". The
     * summary line persists across ledger tab switches and its TEXT
     * changes while the region stays mounted - that is a live region
     * working as designed, and turning it into an alert would
     * interrupt a resident on every filter change.
     */
    const summary = readFileSync(
      resolve('src/components/LedgerSummary.tsx'),
      'utf8',
    )
    expect(summary).toMatch(/aria-live="polite"/)
  })
})
