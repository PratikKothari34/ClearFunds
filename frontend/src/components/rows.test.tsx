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
import { LedgerList } from './LedgerList'
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

  it('an unresolved-flag line pluralises on the count', () => {
    const { container, unmount } = render(<EntryRow entry={{ ...base, openFlagCount: 1 }} />)
    expect(container.textContent).toContain('1 resident has')
    unmount()
    const two = render(<EntryRow entry={{ ...base, openFlagCount: 2 }} />)
    expect(two.container.textContent).toContain('2 residents have')
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
