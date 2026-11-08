/*
 * LEDGER SEARCH.
 *
 * This decided what a resident sees of their own money history and lived in
 * routes/ledger.tsx, where no test could reach it. A search that matches
 * nothing does not read as a bug - it reads as a society with no such entry.
 *
 * The case tests are the reason it moved. `hay` was lowercased and the query
 * was not, so the route had to pass an already-lowercased string and nothing
 * said so. These assert the normalisation is inside, which is what makes the
 * precondition impossible to get wrong rather than merely currently met.
 */
import { describe, expect, it } from 'vitest'
import { match } from './search'
import { categoryLabel } from './format'
import { countable } from './countable'
import type { LedgerRow } from './types'

const base = {
  seq: 7, counterparty: 'Acme Lifts', narration: 'Quarterly service visit',
  category: 'lift', reason: null, amount_minor: -1_250_00, currency: 'INR',
}
const row = (over: Record<string, unknown> = {}) => ({ ...base, ...over }) as unknown as LedgerRow

describe('an empty query', () => {
  it('matches every row, so clearing the box restores the ledger', () => {
    for (const q of ['', ' ', '   ', '\t']) {
      expect(match(row(), q), JSON.stringify(q)).toBe(true)
      expect(match(row({ counterparty: null, narration: '', reason: null }), q)).toBe(true)
    }
  })

  it('matches a row whose amount cannot be read', () => {
    // An unreadable figure must never vanish from the unfiltered list.
    for (const bad of [null, undefined, 'x', Number.NaN, 1.5]) {
      expect(match(row({ amount_minor: bad }), ''), String(bad)).toBe(true)
    }
  })
})

describe('text search is case-insensitive in both directions', () => {
  it('finds a payee however the resident capitalised it', () => {
    /* The defect this guards: the haystack was lowercased and the query was
     * not, so a capitalised query found nothing while the lowercase one
     * worked - and an empty result looks like an empty ledger. */
    for (const q of ['Acme', 'acme', 'ACME', 'aCmE', 'Acme Lifts']) {
      expect(match(row(), q), q).toBe(true)
    }
  })

  it('finds a mixed-case payee from a lowercase query', () => {
    expect(match(row({ counterparty: 'MAHARASHTRA Water Board' }), 'maharashtra')).toBe(true)
    expect(match(row({ counterparty: 'MAHARASHTRA Water Board' }), 'WATER')).toBe(true)
  })

  it('ignores surrounding whitespace the resident typed or pasted', () => {
    for (const q of ['  Acme', 'Acme  ', '  acme  ']) expect(match(row(), q), q).toBe(true)
  })

  it('searches the narration and the reason too, not only the payee', () => {
    const r = row({ counterparty: null })
    expect(match(r, 'quarterly')).toBe(true)
    expect(match(row({ counterparty: null, reason: 'Reversed: billed twice' }), 'billed twice')).toBe(true)
  })

  it('searches the category by the label shown, not by the stored id', () => {
    /* The resident sees the label, so that is what the box must match. No
     * other field may supply the hit - with a payee called "Acme Lifts" the
     * category could be dropped from the haystack entirely and a search for
     * "lift" would still look like it worked. */
    const r = row({ counterparty: null, narration: 'Visit', reason: null, category: 'lift' })
    expect(categoryLabel('lift')).toBe('Lift')
    expect(match(r, 'lift')).toBe(true)
    expect(match(r, 'Lift')).toBe(true)
  })

  it('does not match text that is in no field', () => {
    expect(match(row(), 'plumbing')).toBe(false)
    expect(match(row({ counterparty: null, reason: null }), 'acme')).toBe(false)
  })

  it('does not throw on a row whose optional text is absent', () => {
    expect(() => match(row({ counterparty: null, reason: null }), 'x')).not.toThrow()
  })
})

describe('#n is an exact sequence number, not a fragment', () => {
  it('matches the row with that sequence and no other', () => {
    expect(match(row({ seq: 7 }), '#7')).toBe(true)
    expect(match(row({ seq: 70 }), '#7')).toBe(false)
    expect(match(row({ seq: 8 }), '#7')).toBe(false)
  })

  it('does not fall through to text search, so #7 cannot match a narration', () => {
    /* The rule: an exact lookup that misses returns false rather than
     * quietly becoming a substring search, which would show rows the
     * resident did not ask for under a query that looks precise. */
    expect(match(row({ seq: 1, narration: 'invoice #7 from Acme' }), '#7')).toBe(false)
  })

  it('is anchored, so a text query containing #n is still a text search', () => {
    /* Unanchored, '#7 from' would test as a sequence lookup, Number() would
     * give NaN, and a narration the resident can see would match nothing. */
    expect(match(row({ seq: 1, narration: 'invoice #7 from Acme' }), '#7 from')).toBe(true)
    expect(match(row({ seq: 1, narration: 'invoice #7 from Acme' }), 'e #7 f')).toBe(true)
  })

  it('treats a bare number as a figure search, not a sequence', () => {
    expect(match(row({ seq: 7, amount_minor: -1_250_00 }), '7')).toBe(false)
  })
})

describe('a figure is searched as the resident would write it', () => {
  it('matches the stored minor units from a plain digit query', () => {
    // -125000 minor units; the sign is the direction filter's job.
    expect(match(row(), '125000')).toBe(true)
    expect(match(row(), '1250')).toBe(true)
  })

  it('matches through the separators and symbol a person types', () => {
    for (const q of ['1,25,000', '₹125000', '₹ 1,25,000', '125 000']) {
      expect(match(row(), q), q).toBe(true)
    }
  })

  it('matches a credit and a debit alike, on the absolute value', () => {
    expect(match(row({ amount_minor: 125_000 }), '125000')).toBe(true)
    expect(match(row({ amount_minor: -125_000 }), '125000')).toBe(true)
  })

  it('anchors at the start, so a digit query is a prefix not a fragment', () => {
    expect(match(row({ amount_minor: 125_000 }), '12')).toBe(true)
    expect(match(row({ amount_minor: 125_000 }), '5000')).toBe(false)
  })

  it('matches no digit query at all when the amount cannot be read', () => {
    /* countable() refuses it, so the row is findable by text or not at all -
     * never matching every figure, and never matching none of the text. */
    for (const bad of [null, undefined, 'x', Number.NaN, 1.5]) {
      const r = row({ amount_minor: bad })
      expect(match(r, '125000'), String(bad)).toBe(false)
      expect(match(r, 'acme'), String(bad)).toBe(true)
    }
  })

  it('does not treat a query with letters as a figure', () => {
    const bare = { counterparty: null, narration: '', reason: null, category: null }
    for (const q of ['12a', '1,2x', '₹12-']) {
      expect(match(row({ ...bare, amount_minor: 12 }), q), q).toBe(false)
    }
  })

  it('refuses a figure that only LOOKS like a number', () => {
    /* countable() requires a real safe integer, and this is the reason the
     * flag is read rather than the value coerced: String('125000') starts
     * with '125000', so a numeric STRING from the server would match a
     * figure search while no surface could render it. The search must agree
     * with what the ledger can display. */
    const r = row({ counterparty: null, narration: '', reason: null, category: null, amount_minor: '125000' })
    expect(countable('125000').readable).toBe(false)
    expect(match(r, '125000')).toBe(false)
  })
})
