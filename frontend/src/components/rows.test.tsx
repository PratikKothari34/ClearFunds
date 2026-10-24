import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Entry } from '../lib/types'

// EntryRow links to routes; the router is not under test here.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

import { EntryRow } from './EntryRow'
import { LedgerList, VIRTUALIZE_THRESHOLD } from './LedgerList'
import { LedgerSummary } from './LedgerSummary'
import { NavBadge } from './NavBadge'

afterEach(cleanup)

const base: Entry = {
  id: 'e-1',
  sequence: 1,
  postedAt: '2026-10-21T09:12:00+05:30',
  narration: 'Lift contract',
  payee: 'Omega',
  amount: { minor: 125075, currency: 'INR' },
  direction: 'out',
  state: 'posted',
  balanceAfter: { minor: 1, currency: 'INR' },
  openFlagCount: 0,
  fingerprint: 'abcd',
}

describe('NavBadge', () => {
  it('renders nothing for a count that is not a positive number', () => {
    // NaN <= 0 is false, so a NaN count (a missing server field coerced
    // by arithmetic) would print the literal text "NaN" in a badge.
    for (const bad of [NaN, -3, 0]) {
      const { container, unmount } = render(<NavBadge count={bad} label="Approvals" />)
      expect(container.textContent, String(bad)).toBe('')
      unmount()
    }
  })

  it('never shows a figure past the cap, and shows the real one at the cap', () => {
    const cap = 40
    const { container, unmount } = render(<NavBadge count={cap} label="x" />)
    expect(container.textContent).toContain(String(cap))
    expect(container.textContent).not.toContain(`${cap}+`)
    unmount()
    const over = render(<NavBadge count={cap + 1} label="x" />)
    expect(over.container.textContent).not.toContain(String(cap + 1))
  })
})

describe('LedgerSummary', () => {
  it('never prints a negative hidden count', () => {
    // If the server total lags the rows already held, hidden < 0.
    const { container } = render(
      <LedgerSummary shown={5} total={3} filterLabel="that are flagged" />,
    )
    expect(container.textContent).not.toMatch(/-\d/)
  })

  it('uses singular and plural correctly at 0, 1 and 2', () => {
    for (const [n, word] of [
      [0, 'entries'],
      [1, 'entry'],
      [2, 'entries'],
    ] as const) {
      const { container, unmount } = render(<LedgerSummary shown={n} total={n} />)
      expect(container.textContent, String(n)).toContain(`${n} ${word}`)
      unmount()
    }
  })
})

describe('EntryRow reversals', () => {
  it('a reversed entry is announced as cancelled and keeps its amount visible', () => {
    render(
      <EntryRow
        entry={{
          ...base,
          state: 'reversed',
          reversedBy: { id: 'e-2', sequence: 2, postedAt: '2026-10-22T10:30:00+05:30' },
          reversalReason: 'Billed twice',
        }}
      />,
    )
    expect(screen.getAllByText(/cancelled/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/1,250\.75/)).toBeInTheDocument()
    expect(screen.getByText(/Billed twice/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /correction/i })).toBeInTheDocument()
  })

  it('a reversed entry with no reversedBy still explains itself', () => {
    // The reversal pointer is what carries the reason and the link. If a
    // payload omits it, the resident sees money cancelled with no reason:
    // the exact failure the pairing exists to prevent.
    render(
      <EntryRow
        entry={{ ...base, state: 'reversed', reversalReason: 'Billed twice' }}
      />,
    )
    expect(screen.queryByText(/Billed twice/)).toBeInTheDocument()
  })

  it('a reversal row links back to the original and states the reason', () => {
    render(
      <EntryRow
        entry={{
          ...base,
          state: 'reversal',
          direction: 'in',
          reverses: { id: 'e-0', sequence: 0, postedAt: '2026-10-18T11:05:00+05:30' },
          reversalReason: 'Billed twice',
        }}
      />,
    )
    expect(screen.getByRole('link', { name: /original/i })).toBeInTheDocument()
    expect(screen.getByText(/Billed twice/)).toBeInTheDocument()
  })

  it('counts questions, never residents', () => {
    /*
     * `openFlagCount` is the number of unresolved flags, and one
     * resident may ask twice. The line said "2 residents have asked",
     * which is a claim about how many PEOPLE object to this entry,
     * derived from a number that does not carry it. On a surface where
     * residents are anonymous to each other, overstating how many of
     * them objected is the wrong direction to be wrong in.
     *
     * Asserted as the rule: the count appears, and the word next to it
     * is never a word for people. An assertion on the exact sentence
     * would be "fixed" by editing the expected string.
     */
    const { container, unmount } = render(
      <EntryRow entry={{ ...base, openFlagCount: 1 }} />,
    )
    expect(container.textContent).toContain('1 question')
    expect(container.textContent).not.toMatch(/residents?\b/i)
    unmount()

    const two = render(<EntryRow entry={{ ...base, openFlagCount: 2 }} />)
    expect(two.container.textContent).toContain('2 questions')
    expect(two.container.textContent).not.toMatch(/residents?\b/i)
  })

  it('pluralises the verb with the count', () => {
    const { container, unmount } = render(
      <EntryRow entry={{ ...base, openFlagCount: 1 }} />,
    )
    expect(container.textContent).toContain('question has been asked')
    unmount()

    const two = render(<EntryRow entry={{ ...base, openFlagCount: 2 }} />)
    expect(two.container.textContent).toContain('questions have been asked')
  })

  it('says nothing at all when no question is outstanding', () => {
    /*
     * Not a zero. "0 questions have been asked about this entry" is a
     * confident statement built from a count that may simply be the
     * default, and a resolved question legitimately leaves this count
     * while staying in the entry's log.
     */
    const { container } = render(
      <EntryRow entry={{ ...base, openFlagCount: 0 }} />,
    )
    expect(container.textContent).not.toContain('question')
  })
})

describe('EntryRow dates', () => {
  it('never renders "Invalid Date" for an unparseable timestamp', () => {
    // verify.tsx already documents this failure for the anchor; the row
    // formatter has the same exposure.
    const { container } = render(<EntryRow entry={{ ...base, postedAt: 'not-a-date' }} />)
    expect(container.textContent).not.toContain('Invalid Date')
  })

  it('shows the calendar day in the society time zone, wherever the viewer is', () => {
    /*
     * 2026-04-01 00:30 IST is the first day of the financial year; the
     * same instant is 2026-03-31 in Los Angeles. A non-resident owner
     * reading from abroad would have seen this entry in the PREVIOUS
     * financial year, and the figure they checked against the AGM
     * report would not have added up.
     *
     * Asserted unconditionally, with no TZ juggling: the row formats
     * through lib/dates, which pins the zone, so the answer does not
     * depend on where this test runs. An earlier version set
     * process.env.TZ and bailed out when the runtime ignored it, which
     * meant the test could pass by doing nothing - and did.
     */
    const { container } = render(
      <EntryRow entry={{ ...base, postedAt: '2026-04-01T00:30:00+05:30' }} />,
    )
    expect(container.textContent).toContain('1 Apr 2026')
    expect(container.textContent).not.toContain('31 Mar 2026')
  })
})

describe('LedgerList', () => {
  it('shows the empty message for zero entries and a row per entry otherwise', () => {
    const empty = render(<LedgerList entries={[]} emptyMessage="Nothing here" />)
    expect(empty.container.textContent).toContain('Nothing here')
    empty.unmount()
    const one = render(<LedgerList entries={[base]} />)
    expect(one.container.querySelectorAll('article')).toHaveLength(1)
  })

  it('keeps a reversed original and its reversal in the list (nothing omitted)', () => {
    const rev: Entry = {
      ...base,
      id: 'e-9',
      state: 'reversal',
      direction: 'in',
      reverses: { id: 'e-1', sequence: 1, postedAt: base.postedAt },
      reversalReason: 'r',
    }
    const orig: Entry = {
      ...base,
      state: 'reversed',
      reversedBy: { id: 'e-9', sequence: 9, postedAt: base.postedAt },
      reversalReason: 'r',
    }
    const { container } = render(<LedgerList entries={[rev, orig]} />)
    expect(container.querySelectorAll('article')).toHaveLength(2)
  })
})

/*
 * List semantics on both paths.
 *
 * Both were a bare `div` of rows, so a screen reader announced neither
 * the ledger's length nor a row's position in it. The virtual path is
 * the one that cannot be fixed by markup alone: only the rows near the
 * viewport are mounted, so the accessibility tree holds a dozen of
 * them whatever the real total, and `aria-setsize` is the only thing
 * that can state it.
 *
 * Asserted on BOTH sides of VIRTUALIZE_THRESHOLD, derived from the
 * exported constant rather than a literal - the two paths are
 * different code and a change to one has twice left the other behind.
 */
describe('the ledger announces its length and each row position', () => {
  const entriesOfLength = (n: number): Entry[] =>
    Array.from({ length: n }, (_, i) => ({
      ...base,
      id: `e-${i}`,
      sequence: i + 1,
    }))

  for (const [label, count] of [
    ['the plain path', VIRTUALIZE_THRESHOLD - 1],
    ['the virtual path', VIRTUALIZE_THRESHOLD + 5],
  ] as const) {
    it(`${label} is a list that states its real total`, () => {
      const entries = entriesOfLength(count)
      const { container, unmount } = render(<LedgerList entries={entries} />)

      const list = container.querySelector('[role="list"]')
      expect(list, `${label}: no list role, so nothing announces a list`).not.toBeNull()

      /*
       * THE TOTAL IS ON THE CONTAINER, which is why it is asserted
       * there and not only on the rows.
       *
       * jsdom gives the window no measurable height, so the
       * virtualizer mounts zero rows here - `getVirtualItems()` is
       * empty and there is nothing to carry `aria-setsize`. That is
       * exactly the production condition this fix exists for, in its
       * extreme form: if the length lived only on the rows, a
       * resident on the virtual path would be told the ledger is as
       * long as whatever happens to be mounted. The container's label
       * states it regardless.
       */
      expect(
        list?.getAttribute('aria-label') ?? '',
        `${label}: the list does not state how many entries it holds`,
      ).toMatch(new RegExp(String.raw`\b` + count + String.raw`\b`))

      const items = container.querySelectorAll('[role="listitem"]')
      if (items.length === 0) {
        // Virtual path under jsdom. The container assertion above is
        // the whole guarantee here, and it has been made.
        unmount()
        return
      }

      for (const item of items) {
        /*
         * THE REAL TOTAL, not the number mounted. On the virtual path
         * these differ, and reporting the mounted count would tell a
         * resident the society has twelve entries.
         */
        expect(
          item.getAttribute('aria-setsize'),
          `${label}: a row reports a total that is not the ledger's length`,
        ).toBe(String(count))

        const pos = Number(item.getAttribute('aria-posinset'))
        expect(Number.isInteger(pos), `${label}: position is not a number`).toBe(true)
        expect(pos, `${label}: position is out of range`).toBeGreaterThanOrEqual(1)
        expect(pos, `${label}: position exceeds the total`).toBeLessThanOrEqual(count)
      }

      // Every mounted row has its own position: duplicates would make
      // two rows the same item.
      const positions = [...items].map((i) => i.getAttribute('aria-posinset'))
      expect(
        new Set(positions).size,
        `${label}: two rows claim the same position`,
      ).toBe(positions.length)

      unmount()
    })
  }
})
