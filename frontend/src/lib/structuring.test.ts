import { describe, expect, it } from 'vitest'
import { hasEarlierToPayee, samePayee, type PayeeRow } from './structuring'

/*
 * This suite exists because the rule it covers was WRONG and untested for as
 * long as it lived in `routes/new.tsx`. Logic in a route file cannot be
 * tested without mounting a router, so it was not tested, and a window that
 * spanned 32 days where the report counted 30 shipped unnoticed.
 *
 * So: assert the RULE, never a sample number.
 */

const row = (over: Partial<PayeeRow> = {}): PayeeRow => ({
  effect: 'expense',
  reversed_by_seq: null,
  tier: 'pair',
  counterparty: 'Sharma Traders',
  ...over,
})

describe('samePayee', () => {
  it.each([
    ['identical', 'Sharma Traders', 'Sharma Traders'],
    ['differing case', 'Sharma Traders', 'sharma traders'],
    ['surrounding spaces', ' Sharma Traders ', 'Sharma Traders'],
    ['both, together', '  SHARMA traders', 'sharma traders  '],
  ])('treats %s as one payee, as the server does', (_what, a, b) => {
    expect(samePayee(a, b)).toBe(true)
  })

  it('does not treat different payees as one', () => {
    expect(samePayee('Sharma Traders', 'Verma Traders')).toBe(false)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['only spaces', '   '],
  ])('never matches on %s, which would make every unnamed row the same payee', (_what, v) => {
    expect(samePayee(v, v)).toBe(false)
    expect(samePayee(v, 'Sharma Traders')).toBe(false)
    expect(samePayee('Sharma Traders', v)).toBe(false)
  })
})

describe('hasEarlierToPayee', () => {
  it('warns when an earlier below-limit expense to the same payee exists', () => {
    expect(hasEarlierToPayee([row()], 'Sharma Traders')).toBe(true)
  })

  it('matches the payee ignoring case and surrounding spaces, as the report does', () => {
    expect(hasEarlierToPayee([row({ counterparty: '  sharma TRADERS ' })], 'Sharma Traders')).toBe(true)
  })

  it('does not warn about a reversed payment, which is a corrected mistake', () => {
    /*
     * Written against null explicitly. A reversed payment counted here would
     * accumulate against the payee forever, so the correction would make the
     * warning permanent.
     */
    expect(hasEarlierToPayee([row({ reversed_by_seq: 41 })], 'Sharma Traders')).toBe(false)
  })

  it('does not warn about an above-limit entry, which already had N-of-M', () => {
    // It was never split, so warning about it describes the wrong thing.
    expect(hasEarlierToPayee([row({ tier: 'committee' })], 'Sharma Traders')).toBe(false)
  })

  it.each([
    ['a receipt', 'receipt'],
    ['a charge', 'charge'],
    ['a reversal', 'reversal'],
  ])('does not warn about %s, because structuring is about expenses', (_what, effect) => {
    expect(hasEarlierToPayee([row({ effect })], 'Sharma Traders')).toBe(false)
  })

  /*
   * TWO GUARDS AGREE ON A BLANK PAYEE, AND ONE OF THEM CANNOT BE
   * MUTATION-KILLED ALONE.
   *
   * `hasEarlierToPayee` returns early on a blank field, and `samePayee`'s
   * `x !== ''` refuses a blank on every row. Removing the early return changes
   * no verdict for any input, so that mutant survives by construction - the
   * suite is not missing a case. Removing BOTH is killed, which is what proves
   * the behaviour is guarded rather than incidental; `samePayee`'s own suite
   * above covers the second one directly.
   *
   * The early return is kept for intent and to avoid scanning every row.
   */
  it('does not warn while the payee field is still blank', () => {
    for (const blank of ['', '   ']) {
      expect(hasEarlierToPayee([row()], blank)).toBe(false)
      // The same answer must hold with rows that have no payee of their own,
      // which is the case the redundancy exists to make safe.
      expect(hasEarlierToPayee([row({ counterparty: null }), row({ counterparty: '' })], blank)).toBe(false)
    }
  })

  it('does not warn on an unnamed counterparty', () => {
    // Otherwise every row with no payee would match every payee typed.
    expect(hasEarlierToPayee([row({ counterparty: null })], 'Sharma Traders')).toBe(false)
    expect(hasEarlierToPayee([row({ counterparty: '  ' })], 'Sharma Traders')).toBe(false)
  })

  it.each([
    ['no rows', []],
    ['rows not yet loaded', undefined],
  ])('does not warn with %s', (_what, rows) => {
    expect(hasEarlierToPayee(rows as readonly PayeeRow[] | undefined, 'Sharma Traders')).toBe(false)
  })

  it('warns on the matching row even when other rows do not qualify', () => {
    const rows = [
      row({ effect: 'receipt' }),
      row({ tier: 'committee' }),
      row({ counterparty: 'Verma Traders' }),
      row(), // the only qualifying one
    ]
    expect(hasEarlierToPayee(rows, 'Sharma Traders')).toBe(true)
  })

  /*
   * THE SHAPE OF THE RULE, NOT A NUMBER.
   *
   * The old implementation returned a COUNT, and the bug was in how it bounded
   * the window - something a client cannot do correctly at all, because the
   * society's timezone is not in `Society`. Asserting a boolean is therefore
   * not a weaker test: it is asserting the only thing this layer is entitled
   * to decide. A count here would have to come from the server.
   */
  it('answers whether, not how many, so it cannot disagree with the report', () => {
    const one = hasEarlierToPayee([row()], 'Sharma Traders')
    const many = hasEarlierToPayee([row(), row(), row()], 'Sharma Traders')
    expect(one).toBe(many)
    expect(typeof many).toBe('boolean')
  })

  it('reads no date field at all, so no clock or timezone can change its answer', () => {
    /*
     * The guard against the bug coming back. A row carrying dates that are
     * absurd in every direction must not change the verdict - if a future
     * edit reintroduces a window, this fails.
     */
    const withDates = [
      { ...row(), business_date: '1970-01-01', recorded_at: '1970-01-01T00:00:00Z' },
      { ...row(), business_date: '2099-12-31', recorded_at: '2099-12-31T23:59:59Z' },
    ] as unknown as readonly PayeeRow[]
    expect(hasEarlierToPayee(withDates, 'Sharma Traders')).toBe(true)
    expect(hasEarlierToPayee([withDates[0]!], 'Sharma Traders')).toBe(true)
    expect(hasEarlierToPayee([withDates[1]!], 'Sharma Traders')).toBe(true)
  })
})
