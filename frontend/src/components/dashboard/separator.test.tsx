import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { BalanceBand } from './BalanceBand'
import { EntryRow } from '../EntryRow'
import type { Entry } from '../../lib/types'

/*
 * A DECORATIVE SEPARATOR CARRIES NO WORD BOUNDARY.
 *
 * The meta lines in this product join two facts: a date and a count, a
 * payee and a date. They used to be joined with a middle dot - the
 * separator every generated page reaches for - and the redesign replaced
 * it with a vertical rule, which is the register's own device.
 *
 * The rule is `aria-hidden`, because it is decoration. That silently
 * deleted the boundary the dot had been providing, and the balance band
 * read "as of 25 Oct 202642 entries": the year running into the count,
 * announced as one impossible number directly under the one figure most
 * of this product's audience opens the app to read. Nothing failed, and
 * nothing looked wrong on screen.
 *
 * THESE TESTS ASSERT THE BOUNDARY, NOT THE PUNCTUATION. A later change
 * from a comma to a dash, or back to a dot, should pass; a change that
 * leaves two facts fused should not. So the assertion is that nothing
 * but digits sits between the end of the first fact and the start of
 * the second - the actual defect - rather than that any particular
 * character is present.
 */

afterEach(cleanup)

/*
 * Both fixtures below deliberately put A DIGIT ON EACH SIDE of the
 * separator, because that is the only case where losing the boundary
 * corrupts a value rather than merely looking cramped. A payee ending
 * in a letter would fuse into "Omega25 Oct", which is wrong but still
 * parseable; a year fusing into a count is not.
 *
 * THE CHECK IS ADJACENCY, NOT A DIGIT-RUN LENGTH. A first attempt here
 * looked for a run of five or more digits, which fitted the balance
 * band's "202642" and silently passed the entry row, where the same bug
 * produces only "225" - the test was green against a mutant that had
 * the defect. The length was a property of one fixture, not of the
 * rule. What the rule actually says is that the last character of the
 * first fact and the first character of the second are never both
 * digits, whatever those facts are.
 */

/**
 * The two facts, as the separator left them. Returns the fused text when
 * a digit from the first runs straight into a digit from the second.
 */
function fused(text: string, first: string, second: string): string | null {
  const i = text.indexOf(first)
  const j = text.indexOf(second, i + first.length)
  if (i < 0 || j < 0) {
    throw new Error(
      `fixture not found in output: ${JSON.stringify({ first, second, text })}`,
    )
  }
  const between = text.slice(i + first.length, j)
  // Anything non-empty and non-digit (a comma, a dash, a space, a dot)
  // is a boundary; the defect is the gap vanishing entirely.
  return /^\d*$/.test(between) && /\d$/.test(first) && /^\d/.test(second)
    ? text.slice(i, j + second.length)
    : null
}

describe('meta separators keep their facts apart', () => {
  it('the balance band separates the date from the entry count', () => {
    // Named so the assertion below cannot drift from what was rendered:
    // the year ends the date, the count opens the next fact, and those
    // two are the pair that fuses.
    const YEAR = 2026
    const COUNT = 42

    const { container } = render(
      <BalanceBand
        balance={{ minor: 125075, currency: 'INR' }}
        asOf={`${YEAR}-10-25T09:12:00+05:30`}
        entryCount={COUNT}
      />,
    )

    // The meta paragraph, not the figure above it.
    const meta = container.querySelector('p')
    expect(meta, 'the balance band renders no meta line').not.toBeNull()
    const text = meta!.textContent ?? ''

    expect(
      fused(text, String(YEAR), String(COUNT)),
      `date and count are fused: ${JSON.stringify(text)}`,
    ).toBeNull()
  })

  it('the entry row separates the payee from the date', () => {
    // The payee ENDS IN A DIGIT on purpose, and the date begins with
    // one, so losing the separator fuses them into a single number.
    const PAYEE = 'Otis 2'
    const DAY = 25

    const entry: Entry = {
      id: 'e-1',
      sequence: 1,
      postedAt: `2026-10-${DAY}T09:12:00+05:30`,
      narration: 'Lift contract',
      payee: PAYEE,
      amount: { minor: 125075, currency: 'INR' },
      direction: 'out',
      state: 'posted',
      balanceAfter: { minor: 1, currency: 'INR' },
      openFlagCount: 0,
      fingerprint: 'abcd',
    }

    const { container } = render(<EntryRow entry={entry} />)

    /*
     * THE META PARAGRAPH, not the whole row. The row also carries the
     * amount and the running balance, which are formatted numbers with
     * their own grouping; scanning the full text meant stripping them
     * out again with a second regex, and the pair being tested here was
     * never in them anyway. The paragraph holding the payee is the one
     * the separator lives in.
     */
    const meta = [...container.querySelectorAll('p')].find((el) =>
      (el.textContent ?? '').includes(PAYEE),
    )
    expect(meta, `no meta line contains the payee ${PAYEE}`).toBeDefined()
    const text = meta!.textContent ?? ''

    expect(
      fused(text, PAYEE, String(DAY)),
      `payee and date are fused: ${JSON.stringify(text)}`,
    ).toBeNull()
  })
})
