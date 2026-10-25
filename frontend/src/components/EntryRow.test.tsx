import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LedgerRow } from './EntryRow'
import type { Entry } from '../lib/ledger'
import { formatMoney } from '../lib/money'

/*
 * WHAT A RESIDENT CAN ACTUALLY TELL FROM THE SCREEN.
 *
 * These assert the accessible output, not the markup: a strike-through is
 * decoration and conveys nothing to a screen reader, so "it rendered an <s>"
 * would be a display guard answering an honesty question.
 */

function entry(over: Partial<Entry> = {}): Entry {
  return {
    id: 1479,
    status: 'verified',
    postedAt: '2026-10-24T14:32:00+05:30',
    description: 'Clubhouse deep cleaning',
    counterparty: 'Sparkle Hygiene Services',
    voucher: 'VOUCH-882',
    approvalRoute: 'Treasurer and secretary',
    amount: { minor: 1800000, currency: 'INR' },
    balanceAfter: { minor: 241845050, currency: 'INR' },
    openFlags: 0,
    ...over,
  }
}

describe('a reversed pair', () => {
  const original = entry({ id: 1479, status: 'reversed' })
  const reversal = entry({
    id: 1483,
    status: 'reversal',
    reverses: 1479,
    description: 'Correction of entry #1479',
    reversalReason: 'Paid twice to the same vendor for one invoice.',
    amount: { minor: -1800000, currency: 'INR' },
  })

  it('marks the cancelled AMOUNT itself with a word, not only a strike', () => {
    const { container } = render(
      <LedgerRow row={{ kind: 'reversedPair', original, reversal }} />,
    )
    /*
     * A strike-through is decoration and conveys nothing to a screen reader,
     * so the figure must carry the word itself.
     *
     * This deliberately does NOT search the whole row for /cancelled/i: the
     * item heading contains that word, so a row-wide search stays green even
     * with the amount's hidden text deleted. Proven by mutation - that is
     * exactly how the first version of this test passed on a broken render.
     */
    const struck = container.querySelector('s')
    expect(struck, 'the cancelled figure should be struck through').not.toBeNull()
    const figure = struck!.parentElement
    expect(
      figure?.textContent,
      'the amount element itself must say cancelled; a screen reader skips the strike and would read it out as a live figure',
    ).toMatch(/cancelled/i)
  })

  it('names the entry that cancelled it, so the correction can be found', () => {
    render(<LedgerRow row={{ kind: 'reversedPair', original, reversal }} />)
    expect(
      screen.getByText(new RegExp(`cancelled by entry #${reversal.id}`, 'i')),
      'a resident who cannot see which entry cancelled this one has to take the strike-through on trust',
    ).toBeInTheDocument()
  })

  it('quotes the reason, because the reason is mandatory', () => {
    render(<LedgerRow row={{ kind: 'reversedPair', original, reversal }} />)
    expect(screen.getByText(reversal.reversalReason!)).toBeInTheDocument()
  })

  it('still shows the original entry rather than hiding it', () => {
    render(<LedgerRow row={{ kind: 'reversedPair', original, reversal }} />)
    expect(
      screen.getByText(original.description),
      'omitting a cancelled entry conceals exactly what the chain exists to prove',
    ).toBeInTheDocument()
  })

  it('does not show a running balance against the cancelled entry', () => {
    render(<LedgerRow row={{ kind: 'reversedPair', original, reversal }} />)
    /*
     * The cancelled entry did not move the total. Printing a balance beside
     * it invites subtracting the amount twice.
     */
    expect(screen.getByText(/no effect on balance/i)).toBeInTheDocument()
    /*
     * And the figure must actually be ABSENT, not merely accompanied by that
     * sentence. Asserting only the sentence left a mutant that printed the
     * balance anyway fully green.
     *
     * The original and the reversal share a balanceAfter in this fixture, so
     * the reversal legitimately prints it once. Exactly one occurrence means
     * the cancelled half printed none.
     */
    const balance = formatMoney(original.balanceAfter!)!
    expect(
      screen.getAllByText(balance).length,
      'a balance beside a cancelled entry invites subtracting the amount twice',
    ).toBe(1)
  })

  it('says so when a reversal arrived with no reason', () => {
    const noReason = { ...reversal, reversalReason: '   ' }
    render(
      <LedgerRow
        row={{ kind: 'reversedPair', original, reversal: noReason }}
      />,
    )
    expect(
      screen.getByText(/no reason was recorded/i),
      'the reason is mandatory, so a blank one is a contract breach - leaving the space empty would read as "no reason needed"',
    ).toBeInTheDocument()
  })
})

describe('an ordinary row', () => {
  it('states an unreadable amount instead of substituting a number', () => {
    const broken = entry({ amount: { minor: Number.NaN, currency: 'INR' } })
    render(<LedgerRow row={{ kind: 'entry', entry: broken }} />)
    expect(
      screen.getAllByText(/could not be read/i).length,
      'a dash or a 0.00 would be a claim made on data that could not be read',
    ).toBeGreaterThan(0)
  })

  it('states an unreadable date instead of printing Invalid Date', () => {
    const broken = entry({ postedAt: 'not-a-date' })
    render(<LedgerRow row={{ kind: 'entry', entry: broken }} />)
    expect(screen.getByText(/date could not be read/i)).toBeInTheDocument()
    expect(screen.queryByText(/invalid date/i)).toBeNull()
  })

  it('counts resident queries without implying the amount is wrong', () => {
    const queried = entry({ openFlags: 2 })
    render(<LedgerRow row={{ kind: 'entry', entry: queried }} />)
    const note = screen.getByText(/queried this entry/i)
    expect(note).toBeInTheDocument()
    /*
     * A flag has NO financial effect - residents raise disputes, they do not
     * move money. The note must not use reversal vocabulary.
     */
    expect(note.textContent).not.toMatch(/cancel|revers|invalid|wrong/i)
  })

  it('says "No voucher" rather than leaving the cell blank', () => {
    render(<LedgerRow row={{ kind: 'entry', entry: entry({ voucher: null }) }} />)
    expect(screen.getByText(/no voucher/i)).toBeInTheDocument()
  })

  it('strikes an entry marked cancelled whose reversal is not on this page', () => {
    render(
      <LedgerRow row={{ kind: 'entry', entry: entry({ status: 'reversed' }) }} />,
    )
    /* Still shown, still marked - there is simply no reversal to link. */
    expect(screen.getAllByText(/cancelled/i).length).toBeGreaterThan(0)
  })
})
