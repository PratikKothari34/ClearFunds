/**
 * AN AMOUNT FIELD MUST NOT DELETE THE CHARACTER THAT CHANGES THE AMOUNT.
 *
 * `MoneyInput` filtered itself with `replace(/[^\d.,]/g, '')`. That drops a
 * minus sign instead of refusing it, so typing `-5` left `5` in the field and
 * `parse` - which does refuse `-5` - was handed `5` and returned 500 minor
 * units. A request to subtract five rupees became a proposal to spend five
 * rupees, on three screens at once, all sharing the component: `/new`, the
 * change-limit dialog on `/committee`, and the replacement amount in a
 * reversal.
 *
 * Found by using the running app, not by a test. The amount is signed into an
 * append-only chain, so the correction is a reversal that stays visible
 * forever - which is why a silently rewritten figure is not cosmetic.
 *
 * Tests the FILTER and the PARSER TOGETHER, because the defect was in neither
 * one alone: each was self-consistent, and the bug lived in what the filter
 * removed before the parser could judge it. A test of `parse` alone passes on
 * the broken build, which is how this survived.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse, typedAmount } from './money'

/** The pipeline as the field really runs it: filter the keystroke, then parse. */
const field = (raw: string) => parse(typedAmount(raw), 'INR')

/** The filter as it used to be, for the contrast the tests assert against. */
const oldFilter = (raw: string) => raw.replace(/[^\d.,]/g, '')

describe('typedAmount', () => {
  it('THE DEFECT: a negative amount is refused, never rewritten as positive', () => {
    // The old filter turned "-5" into "5" and the field proposed ₹5.00.
    expect(parse(oldFilter('-5'), 'INR')).toBe(500)
    // It must now reach the parser intact and be refused.
    expect(typedAmount('-5')).toContain('-')
    expect(field('-5')).toBeNull()
  })

  it('refuses a minus wherever it appears, not only in front', () => {
    for (const raw of ['-5', '--5', '5-', '-0', '-12,500', '1-2', '-1250.50']) {
      expect(field(raw)).toBeNull()
    }
  })

  it('keeps every character that could change the value, so the parser decides', () => {
    /*
     * The rule, not a list: anything that is not whitespace or a currency
     * mark survives the filter. A filter that silently removed any of these
     * would be deciding the amount itself.
     */
    for (const ch of ['-', '+', 'e', 'E', '/', '*', '%', '(', ')', '.', ',', '0', '9']) {
      expect(typedAmount(ch)).toBe(ch)
    }
  })

  it('drops only what cannot change the value, exactly as the parser does', () => {
    // These are the marks a person types or pastes; `parse` strips them too,
    // so removing them here cannot change any answer.
    expect(typedAmount(' 12,500 ')).toBe('12,500')
    expect(typedAmount('₹12,500')).toBe('12,500')
    expect(typedAmount('₹ 1 2 5 0 . 5 0')).toBe('1250.50')
  })

  it('accepts what a person legitimately types, unchanged in value', () => {
    expect(field('12,500')).toBe(1250000)
    expect(field('1250.50')).toBe(125050)
    expect(field('₹12,500')).toBe(1250000)
    expect(field(' 12500 ')).toBe(1250000)
    // Zero is a real limit - it sends every entry to the committee - so it
    // must parse, and callers distinguish it from null themselves.
    expect(field('0')).toBe(0)
  })

  it('still refuses what the parser always refused', () => {
    for (const raw of ['', 'abc', '1.999', '12.5.6', '1,2.3.4', '.', ',']) {
      expect(field(raw)).toBeNull()
    }
  })

  it('never turns an unparseable amount into a parseable one', () => {
    /*
     * THE INVARIANT, asserted over the whole space rather than a chosen few:
     * filtering may only ever remove characters that do not change the value,
     * so whatever the field yields must agree with parsing the raw string
     * once its whitespace and currency marks are gone. The old filter broke
     * exactly this - it made `-5` parseable.
     */
    const pieces = ['-', '1', '5', '.', ',', '0', ' ', '₹', 'a']
    for (const a of pieces) {
      for (const b of pieces) {
        for (const c of pieces) {
          const raw = a + b + c
          expect(field(raw)).toBe(parse(raw.replace(/[\s₹]/g, ''), 'INR'))
          // And the real guarantee: a value-bearing character is never lost.
          expect(typedAmount(raw)).toBe(raw.replace(/[\s₹]/g, ''))
        }
      }
    }
  })

  it('is idempotent, so a re-render cannot change what was typed', () => {
    for (const raw of ['-5', '12,500', '₹ 1250.50', 'abc']) {
      expect(typedAmount(typedAmount(raw))).toBe(typedAmount(raw))
    }
  })
})

/*
 * THAT THE FILTER IS WIRED, which the cases above cannot reach.
 *
 * Everything above passes just as happily when `MoneyInput` filters itself
 * with its own inline regex and never calls this function - which is the
 * state the bug was found in. The function is the reporter; the component's
 * `onChange` is the decision, and an unused filter is indistinguishable from
 * no filter while looking fully tested. Same reasoning as
 * `components/boundary.wiring.test.ts`, and the same trap: comments are
 * stripped first, because this file's own prose and the component's own
 * prose both name `typedAmount`, so a bare substring search would pass on a
 * file that merely TALKS about it.
 */
describe('MoneyInput is wired to it', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'components', 'ui.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('hands each keystroke to typedAmount', () => {
    expect(src).toContain('onChange(typedAmount(e.target.value))')
  })

  it('imports it from the money module rather than redefining it', () => {
    expect(src).toMatch(/import \{[^}]*\btypedAmount\b[^}]*\} from '\.\.\/lib\/money'/)
  })

  it('does NOT filter the amount field with an inline character class', () => {
    /*
     * The exact shape of the defect: a `replace` in the component that drops
     * anything outside a whitelist takes the minus sign with it, before
     * `parse` can refuse it. If this ever comes back, the amount is being
     * decided here again instead of in `lib/`.
     */
    expect(src).not.toMatch(/replace\(\s*\/\[\^\\d/)
  })
})
