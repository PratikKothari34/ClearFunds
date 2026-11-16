import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Misconfigured } from './Misconfigured'
import { environmentFault } from '../lib/environment'

/*
 * THIS SCREEN IS THE FIX FOR A BLANK PRODUCTION PAGE, SO IT MUST BE PROVEN TO
 * RENDER.
 *
 * `environment.test.ts` covers the function that DECIDES there is a fault.
 * That is the right thing to test and it is already tested. But the decision
 * is only half of what production depends on: the deployed build was serving
 * an empty `#root`, and what replaces it is this component. A fault object
 * computed correctly and then rendered by a component that throws, or that
 * renders nothing, is the same blank page with more code behind it.
 *
 * So this suite asserts the RENDERED OUTPUT, and it drives that output from
 * the real `environmentFault()` rather than a hand-written fault literal - a
 * literal would keep passing if the two ever disagreed about the shape, which
 * is exactly the seam where a screen goes blank.
 */
describe('Misconfigured', () => {
  const bothUnset = environmentFault(false, false)!
  const urlOnly = environmentFault(false, true)!

  it('renders a message instead of nothing, which is the whole point', () => {
    const { container } = render(<Misconfigured fault={bothUnset} />)
    /*
     * The failure being guarded is an EMPTY root. Asserting on a specific
     * sentence would not catch a component that rendered only a wrapper, so
     * the first assertion is that visible text exists at all.
     */
    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0)
    expect(screen.getByText(/this app is not configured/i)).toBeTruthy()
  })

  it('names every unset variable, because half a configuration is the confusing case', () => {
    render(<Misconfigured fault={bothUnset} />)
    const text = document.body.textContent ?? ''
    for (const name of bothUnset.missing) {
      expect(text, `${name} is unset but the screen never names it`).toContain(name)
    }
  })

  it('names only the variable that is actually unset', () => {
    /*
     * A reader told "Supabase is not configured" when one value IS set
     * re-checks the one that was already correct. The screen must not widen
     * the fault beyond what was found.
     */
    render(<Misconfigured fault={urlOnly} />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('VITE_SUPABASE_URL')
    expect(
      text,
      'the key is set, so naming it sends the reader to check the wrong thing',
    ).not.toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
  })

  it('never asserts anything about the ledger, which it cannot see', () => {
    render(<Misconfigured fault={bothUnset} />)
    const text = (document.body.textContent ?? '').toLowerCase()
    /*
     * A client that cannot reach the server knows NOTHING about the record.
     * "No entries", "empty" or "nothing has been recorded" would each be true
     * about this screen and false about the society - the worst available
     * lie in a product whose claim is about the record itself.
     */
    for (const claim of ['no entries', 'no entry', 'empty ledger', 'nothing has been recorded', 'no money']) {
      expect(text, `the screen claims "${claim}" about a ledger it cannot read`).not.toContain(claim)
    }
  })

  it('offers no retry, because every retry fails identically until a rebuild', () => {
    const { container } = render(<Misconfigured fault={bothUnset} />)
    /*
     * The values are inlined at BUILD time. A retry control here is a loop
     * with no exit, so its absence is a design decision worth pinning rather
     * than a gap.
     */
    expect(container.querySelectorAll('button').length, 'a control that cannot work is worse than none').toBe(0)
    expect((document.body.textContent ?? '').toLowerCase()).not.toContain('try again')
  })
})
