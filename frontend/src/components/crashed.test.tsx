import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CatchBoundary } from '@tanstack/react-router'
import { Crashed } from './Crashed'
import { format } from '../lib/money'

/*
 * What is under test is CONTAINMENT, not copy.
 *
 * A suite that renders <Crashed error={new Error('x')} /> and asserts on the
 * wording proves the card looks right once the answer is known. It cannot
 * prove a throw reaches it, which is the entire guard - the tree had no
 * boundary for months while every surface rendered correctly.
 *
 * So these mount a component that genuinely throws, through the real
 * CatchBoundary, and assert the sibling survives. The throw comes from
 * money.ts where possible, because that is the documented production path:
 * RangeError raised during render on a value that is not a safe integer.
 */

// React logs a caught error to console.error. That is expected here, so it is
// silenced per-test rather than globally - a global silence would hide a real
// warning from every other suite in the file.
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => vi.restoreAllMocks())

function Boom({ minor }: { minor: number }) {
  // The real path: format() raises RangeError on a non-safe-integer amount.
  return <span>{format(minor, 'INR')}</span>
}

describe('the render boundary', () => {
  it('contains a throw from money.ts and keeps the sibling rendered', () => {
    quiet()
    // Guard the premise: this input must actually throw, or the test proves
    // nothing. A version of money.ts that stopped throwing would make every
    // assertion below pass vacuously.
    expect(() => format(NaN, 'INR')).toThrow(RangeError)

    render(
      <div>
        <p>the rest of the app</p>
        <CatchBoundary getResetKey={() => 'k'} errorComponent={Crashed}>
          <Boom minor={NaN} />
        </CatchBoundary>
      </div>,
    )

    // The boundary rendered instead of the crash propagating.
    expect(screen.getByText(/could not be drawn/i)).toBeInTheDocument()
    // And the sibling outside the boundary is still there: this is the whole
    // difference from the old behaviour, where the tree went to white.
    expect(screen.getByText('the rest of the app')).toBeInTheDocument()
  })

  it('does not swallow a successful render', () => {
    // The allow half. A boundary that renders its error component
    // unconditionally would pass the test above.
    render(
      <CatchBoundary getResetKey={() => 'k'} errorComponent={Crashed}>
        <Boom minor={125075} />
      </CatchBoundary>,
    )
    expect(screen.queryByText(/could not be drawn/i)).not.toBeInTheDocument()
    expect(screen.getByText(/1,250\.75/)).toBeInTheDocument()
  })

  it('shows the thrown message, because an unreportable fault is not fixed', () => {
    quiet()
    render(
      <CatchBoundary getResetKey={() => 'k'} errorComponent={Crashed}>
        <Boom minor={NaN} />
      </CatchBoundary>,
    )
    // Asserting the RULE - the detail reaches the screen - not a fixed string.
    // A resident reporting this to the committee is how we hear about it.
    let thrown = ''
    try {
      format(NaN, 'INR')
    } catch (e) {
      thrown = e instanceof Error ? e.message : ''
    }
    expect(thrown).not.toBe('')
    expect(screen.getByText(thrown)).toBeInTheDocument()
  })

  it('offers no "try again" that re-runs the same failing fetch', () => {
    quiet()
    render(
      <CatchBoundary getResetKey={() => 'k'} errorComponent={Crashed}>
        <Boom minor={NaN} />
      </CatchBoundary>,
    )
    // `Failed` says "Could not load this" and offers a retry, which is a claim
    // about the network. The data arrived here; re-fetching repeats the crash.
    // If someone swaps this card for `Failed`, this fails.
    expect(screen.queryByText(/could not load this/i)).not.toBeInTheDocument()
  })

  it('never tells the resident the ledger itself is affected', () => {
    quiet()
    render(
      <CatchBoundary getResetKey={() => 'k'} errorComponent={Crashed}>
        <Boom minor={NaN} />
      </CatchBoundary>,
    )
    // The product exists to prove the record was not changed quietly. A render
    // fault must not imply otherwise on a money surface.
    expect(screen.getByText(/nothing in the ledger has changed/i)).toBeInTheDocument()
  })

  it('keeps every action at the 44px tap-target floor', () => {
    quiet()
    render(
      <CatchBoundary getResetKey={() => 'k'} errorComponent={Crashed}>
        <Boom minor={NaN} />
      </CatchBoundary>,
    )
    // h-9 is 36px. The floor is about the size of a finger, so it does not
    // bend on the one screen where a mis-tap is least recoverable.
    for (const b of screen.getAllByRole('button')) {
      expect(b.className, b.textContent ?? '').not.toMatch(/\bh-9\b/)
    }
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })
})
